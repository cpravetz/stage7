import { Collection } from 'mongodb';
import { MongoBaseStore, stripMongoId } from '@stage7-nextgen/shared';
import { User, ServiceAccount } from '../types';

export class MongoUserStore extends MongoBaseStore {
  protected readonly storeName = 'MongoUserStore';
  private users: Collection<User & { _id?: string }> | null = null;

  protected async initialize(): Promise<void> {
    this.users = this.db!.collection<User & { _id?: string }>('users');
    await this.users.createIndex({ email: 1 }, { unique: true });
    await this.users.createIndex({ id: 1 }, { unique: true });
  }

  protected override onConnectFailed(): void {
    this.users = null;
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
    return result ? stripMongoId<User>(result) : undefined;
  }

  async findById(id: string): Promise<User | undefined> {
    if (!this.users) await this.connect();
    const result = await this.users!.findOne({ id } as any);
    return result ? stripMongoId<User>(result) : undefined;
  }

  async list(): Promise<User[]> {
    if (!this.users) await this.connect();
    const results = await this.users!.find({}).toArray();
    return results.map((r) => stripMongoId<User>(r));
  }
}

export class MongoServiceAccountStore extends MongoBaseStore {
  protected readonly storeName = 'MongoServiceAccountStore';
  private services: Collection<ServiceAccount & { _id?: string }> | null = null;

  protected async initialize(): Promise<void> {
    this.services = this.db!.collection<ServiceAccount & { _id?: string }>('serviceAccounts');
    await this.services.createIndex({ serviceId: 1 }, { unique: true });
    await this.services.createIndex({ id: 1 }, { unique: true });
  }

  protected override onConnectFailed(): void {
    this.services = null;
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
    return result ? stripMongoId<ServiceAccount>(result) : undefined;
  }

  async list(): Promise<ServiceAccount[]> {
    if (!this.services) await this.connect();
    const results = await this.services!.find({}).toArray();
    return results.map((r) => stripMongoId<ServiceAccount>(r));
  }
}
