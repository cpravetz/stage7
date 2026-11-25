#!/usr/bin/env node
/**
 * One-time migration: re-tenant Vault secrets stored under the legacy 'system'
 * tenant so they resolve under the operator's tenant (ADMIN_TENANT, default
 * 'tenant-1') once the frontend sends the authenticated user's tenant instead
 * of the hardcoded 'system' one.
 *
 * Tenant is metadata, not key material: the AES-256-GCM envelope in the
 * `encrypted` field is left untouched, so migrated secrets stay decryptable
 * end to end (the MASTER_KEY does not change).
 *
 * Safe to run more than once: only documents still under the 'system' tenant
 * are touched, so a second run is a no-op.
 *
 * Usage:
 *   MONGO_URI=mongodb://localhost:27017 node services/vault/scripts/migrate-system-tenant.js \
 *     [--tenant <targetTenantId>] [--from <sourceTenantId>] [--dry-run]
 *
 * Flags:
 *   --tenant   Target tenant to move secrets into (default: ADMIN_TENANT env,
 *              then 'tenant-1' — matching the auth service's seeded admin).
 *   --from     Source tenant to migrate away from (default: 'system').
 *   --dry-run  Report what would change without writing.
 *
 * Run once per deployment, before upgrading the frontend past the per-user
 * tenant change, so existing secrets remain visible in the Vault UI.
 *
 * Name collisions: the vault enforces a unique (tenantId, name) index. If the
 * target tenant already holds a secret with the same name, the migrated
 * secret is renamed with an increasing '-migrated-from-<source>' suffix
 * rather than overwritten.
 */

const { MongoClient } = require('mongodb');

function parseArgs(argv) {
  const args = { from: 'system' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tenant') args.tenant = argv[++i];
    else if (argv[i] === '--from') args.from = argv[++i];
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('See the header comment in services/vault/scripts/migrate-system-tenant.js for usage.');
    process.exit(0);
  }

  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is required (same variable the vault service uses).');
    process.exit(1);
  }
  // Mirrors shared-nextgen/src/data/mongo.ts: MONGO_DB, then 'stage7'.
  const dbName = process.env.MONGO_DB || 'stage7';
  const targetTenant = args.tenant || process.env.ADMIN_TENANT || 'tenant-1';

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const secrets = client.db(dbName).collection('secrets');
    const query = { tenantId: args.from };
    const candidates = await secrets.find(query).toArray();

    console.log(
      `Migrating ${candidates.length} secret(s) from tenant "${args.from}" to "${targetTenant}"` +
        (args.dryRun ? ' (dry run — nothing written)' : '') +
        ` in db "${dbName}".`,
    );

    let migrated = 0;
    let renamed = 0;
    for (const secret of candidates) {
      const update = { tenantId: targetTenant };
      let name = secret.name;

      // Unique (tenantId, name) index: rename on collision instead of failing.
      while (await secrets.findOne({ tenantId: targetTenant, name })) {
        name = `${secret.name}-migrated-from-${args.from}${renamed > 0 ? `-${renamed}` : ''}`;
        update.name = name;
        renamed += 1;
      }

      if (args.dryRun) {
        console.log(`  would move "${secret.name}"${name !== secret.name ? ` (renamed to "${name}")` : ''}`);
        migrated += 1;
        continue;
      }

      // $set touches metadata only — the encrypted envelope is never read or rewritten.
      const result = await secrets.updateOne({ _id: secret._id }, { $set: update });
      if (result.modifiedCount === 1) {
        migrated += 1;
        console.log(
          `  moved "${secret.name}"${name !== secret.name ? ` (renamed to "${name}")` : ''} — id ${secret.id}`,
        );
      } else {
        console.warn(`  no change for id ${secret.id} (already migrated or deleted concurrently)`);
      }
    }

    console.log(`Done: ${migrated} secret(s) migrated, ${renamed} rename(s) applied.`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
