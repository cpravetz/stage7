import { User, ServiceAccount } from '../types';
import { MongoClient, Db, Collection } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017';
const MONGO_DB = process.env.MONGO_DB || 'stage7';

export class MongoUserStore {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private users: Collection<User & { _id?: string }> | null = null;

  async connect(): Promise<void> {
    if (this.users) return;
    try {
      this.client = new MongoClient(MONGO_URI);
      const connectPromise = this.client.connect();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('MongoDB connection timeout')), 3000)
      );
      await Promise.race([connectPromise, timeoutPromise]);
      this.db = this.client.db(MONGO_DB);
      this.users = this.db.collection<User & { _id?: string }>('users');
      await this.users.createIndex({ email: 1 }, { unique: true });
      await this.users.createIndex({ id: 1 }, { unique: true });
    } catch (err) {
      console.error('MongoUserStore connection failed:', err);
      this.client = null;
      this.db = null;
      this.users = null;
      throw err;
    }
  }

  async create(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
    if (!this.users) await this.connect();
    const now = new Date();
    const fullUser: User & { _id?: string } = {
      ...user,
      createdAt: now,
      updatedAt: now,
    };
    await this.users!.replaceOne({ id: fullUser.id }, fullUser, { upsert: true });
    return fullUser as User;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    if (!this.users) await this.connect();
    const result = await this.users!.findOne({ email } as any);
    if (!result) return undefined;
    const { _id, ...rest } = result as any;
    return rest as User;
  }

  async findById(id: string): Promise<User | undefined> {
    if (!this.users) await this.connect();
    const result = await this.users!.findOne({ id } as any);
    if (!result) return undefined;
    const { _id, ...rest } = result as any;
    return rest as User;
  }

  async list(): Promise<User[]> {
    if (!this.users) await this.connect();
    const results = await this.users!.find({}).toArray();
    return results.map((r: any) => {
      const { _id, ...rest } = r;
      return rest as User;
    });
  }
}

export class MongoServiceAccountStore {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private services: Collection<ServiceAccount & { _id?: string }> | null = null;

  async connect(): Promise<void> {
    if (this.services) return;
    try {
      this.client = new MongoClient(MONGO_URI);
      const connectPromise = this.client.connect();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('MongoDB connection timeout')), 3000)
      );
      await Promise.race([connectPromise, timeoutPromise]);
      this.db = this.client.db(MONGO_DB);
      this.services = this.db.collection<ServiceAccount & { _id?: string }>('serviceAccounts');
      await this.services.createIndex({ serviceId: 1 }, { unique: true });
      await this.services.createIndex({ id: 1 }, { unique: true });
    } catch (err) {
      console.error('MongoServiceAccountStore connection failed:', err);
      this.client = null;
      this.db = null;
      this.services = null;
      throw err;
    }
  }

  async create(account: Omit<ServiceAccount, 'createdAt' | 'updatedAt'>): Promise<ServiceAccount> {
    if (!this.services) await this.connect();
    const now = new Date();
    const fullAccount: ServiceAccount & { _id?: string } = {
      ...account,
      createdAt: now,
      updatedAt: now,
    };
    await this.services!.replaceOne({ id: fullAccount.id }, fullAccount, { upsert: true });
    return fullAccount as ServiceAccount;
  }

  async findByServiceId(serviceId: string): Promise<ServiceAccount | undefined> {
    if (!this.services) await this.connect();
    const result = await this.services!.findOne({ serviceId } as any);
    if (!result) return undefined;
    const { _id, ...rest } = result as any;
    return rest as ServiceAccount;
  }

  async list(): Promise<ServiceAccount[]> {
    if (!this.services) await this.connect();
    const results = await this.services!.find({}).toArray();
    return results.map((r: any) => {
      const { _id, ...rest } = r;
      return rest as ServiceAccount;
    });
  }
}
