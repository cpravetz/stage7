import { User, ServiceAccount } from '../types';

export interface UserStore {
  create(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User>;
  findByEmail(email: string): Promise<User | undefined>;
  findById(id: string): Promise<User | undefined>;
  list(): Promise<User[]>;
}

export interface ServiceAccountStore {
  create(account: Omit<ServiceAccount, 'createdAt' | 'updatedAt'>): Promise<ServiceAccount>;
  findByServiceId(serviceId: string): Promise<ServiceAccount | undefined>;
  list(): Promise<ServiceAccount[]>;
}

class InMemoryUserStore {
  private users: Map<string, User> = new Map();

  create(user: Omit<User, 'createdAt' | 'updatedAt'>): User {
    const now = new Date();
    const fullUser: User = {
      ...user,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(fullUser.id, fullUser);
    return fullUser;
  }

  findByEmail(email: string): User | undefined {
    return Array.from(this.users.values()).find((u) => u.email === email);
  }

  findById(id: string): User | undefined {
    return this.users.get(id);
  }

  list(): User[] {
    return Array.from(this.users.values());
  }
}

class InMemoryServiceAccountStore {
  private accounts: Map<string, ServiceAccount> = new Map();

  create(account: Omit<ServiceAccount, 'createdAt' | 'updatedAt'>): ServiceAccount {
    const now = new Date();
    const fullAccount: ServiceAccount = {
      ...account,
      createdAt: now,
      updatedAt: now,
    };
    this.accounts.set(fullAccount.id, fullAccount);
    return fullAccount;
  }

  findByServiceId(serviceId: string): ServiceAccount | undefined {
    return Array.from(this.accounts.values()).find((s) => s.serviceId === serviceId);
  }

  list(): ServiceAccount[] {
    return Array.from(this.accounts.values());
  }
}

export class PersistentUserStore implements UserStore {
  private mongoStore: any = null;
  private fallback: InMemoryUserStore;
  private connectPromise: Promise<void> | null = null;

  constructor() {
    this.fallback = new InMemoryUserStore();
  }

  private async ensureMongo(): Promise<void> {
    if (this.mongoStore) return;
    if (this.connectPromise) return this.connectPromise;
    if (!process.env.MONGO_URI) return;

    this.connectPromise = (async () => {
      try {
        const { MongoUserStore } = require('./mongoStore');
        this.mongoStore = new MongoUserStore();
        await this.mongoStore.connect();
      } catch {
        this.mongoStore = null;
      }
    })();

    return this.connectPromise;
  }

  async create(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
    await this.ensureMongo();
    if (this.mongoStore) {
      try {
        return await this.mongoStore.create(user);
      } catch {
        // fallback
      }
    }
    return this.fallback.create(user as any);
  }

  async findByEmail(email: string): Promise<User | undefined> {
    await this.ensureMongo();
    if (this.mongoStore) {
      try {
        return await this.mongoStore.findByEmail(email);
      } catch {
        // fallback
      }
    }
    return this.fallback.findByEmail(email);
  }

  async findById(id: string): Promise<User | undefined> {
    await this.ensureMongo();
    if (this.mongoStore) {
      try {
        return await this.mongoStore.findById(id);
      } catch {
        // fallback
      }
    }
    return this.fallback.findById(id);
  }

  async list(): Promise<User[]> {
    await this.ensureMongo();
    if (this.mongoStore) {
      try {
        return await this.mongoStore.list();
      } catch {
        // fallback
      }
    }
    return this.fallback.list();
  }
}

export class PersistentServiceAccountStore implements ServiceAccountStore {
  private mongoStore: any = null;
  private fallback: InMemoryServiceAccountStore;
  private connectPromise: Promise<void> | null = null;

  constructor() {
    this.fallback = new InMemoryServiceAccountStore();
  }

  private async ensureMongo(): Promise<void> {
    if (this.mongoStore) return;
    if (this.connectPromise) return this.connectPromise;
    if (!process.env.MONGO_URI) return;

    this.connectPromise = (async () => {
      try {
        const { MongoServiceAccountStore } = require('./mongoStore');
        this.mongoStore = new MongoServiceAccountStore();
        await this.mongoStore.connect();
      } catch {
        this.mongoStore = null;
      }
    })();

    return this.connectPromise;
  }

  async create(account: Omit<ServiceAccount, 'createdAt' | 'updatedAt'>): Promise<ServiceAccount> {
    await this.ensureMongo();
    if (this.mongoStore) {
      try {
        return await this.mongoStore.create(account);
      } catch {
        // fallback
      }
    }
    return this.fallback.create(account as any);
  }

  async findByServiceId(serviceId: string): Promise<ServiceAccount | undefined> {
    await this.ensureMongo();
    if (this.mongoStore) {
      try {
        return await this.mongoStore.findByServiceId(serviceId);
      } catch {
        // fallback
      }
    }
    return this.fallback.findByServiceId(serviceId);
  }

  async list(): Promise<ServiceAccount[]> {
    await this.ensureMongo();
    if (this.mongoStore) {
      try {
        return await this.mongoStore.list();
      } catch {
        // fallback
      }
    }
    return this.fallback.list();
  }
}
