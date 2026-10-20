import { MongoClient } from 'mongodb';
import { MongoStore } from '../src/services/MongoStore';

const integrationEnabled = process.env.MONGO_INTEGRATION_TESTS === '1';
const integrationUri = process.env.MONGO_URI;
const integrationDb = process.env.MONGO_DB;
const describeMongo = integrationEnabled ? describe : describe.skip;

describeMongo('MongoStore mission recovery leases (integration)', () => {
  let store: MongoStore | undefined;
  let client: MongoClient | undefined;

  beforeAll(async () => {
    if (
      !integrationUri
      || !integrationDb
      || !/^stage7_agentic_parity_[a-zA-Z0-9_]+$/.test(integrationDb)
    ) {
      throw new Error('Mongo integration requires MONGO_URI and a dedicated stage7_agentic_parity_* MONGO_DB');
    }

    client = new MongoClient(integrationUri);
    await client.connect();
    const databases = await client.db('admin').admin().listDatabases();
    if (databases.databases.some((database) => database.name === integrationDb)) {
      throw new Error(`Refusing to overwrite existing Mongo integration database ${integrationDb}`);
    }

    store = new MongoStore();
    await store.connect();
  });

  afterAll(async () => {
    await store?.disconnect();
    if (client && integrationDb) {
      await client.db(integrationDb).dropDatabase();
      await client.close();
    }
  });

  it('serializes competing claims, renews only the owner, and permits takeover after expiry', async () => {
    if (!store) throw new Error('Mongo integration store was not initialized');
    const now = new Date();
    const firstExpiry = new Date(now.getTime() + 30_000);
    const claims = await Promise.all([
      store.claimMissionRecoveryLease('integration-mission', 'owner-a', firstExpiry, now),
      store.claimMissionRecoveryLease('integration-mission', 'owner-b', firstExpiry, now),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    const owner = claims[0] ? 'owner-a' : 'owner-b';
    const otherOwner = owner === 'owner-a' ? 'owner-b' : 'owner-a';
    expect(await store.renewMissionRecoveryLease(
      'integration-mission',
      otherOwner,
      new Date(now.getTime() + 60_000),
    )).toBe(false);
    expect(await store.renewMissionRecoveryLease(
      'integration-mission',
      owner,
      new Date(now.getTime() + 60_000),
    )).toBe(true);
    expect(await store.claimMissionRecoveryLease(
      'integration-mission',
      otherOwner,
      new Date(now.getTime() + 90_000),
      new Date(now.getTime() + 30_001),
    )).toBe(false);
    expect(await store.claimMissionRecoveryLease(
      'integration-mission',
      otherOwner,
      new Date(now.getTime() + 120_000),
      new Date(now.getTime() + 60_001),
    )).toBe(true);
    expect(await store.releaseMissionRecoveryLease('integration-mission', owner)).toBe(false);
    expect(await store.releaseMissionRecoveryLease('integration-mission', otherOwner)).toBe(true);
  });
});
