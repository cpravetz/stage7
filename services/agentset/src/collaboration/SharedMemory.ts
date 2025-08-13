import { v4 as uuidv4 } from 'uuid';
import { analyzeError } from '@cktmcs/errorhandler';

/**
 * Memory entry
 */
export interface MemoryEntry {
  id: string;
  key: string;
  value: any;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  tags: string[];
  accessControl: {
    read: string[]; // Agent IDs or 'all'
    write: string[]; // Agent IDs or 'all'
  };
  version: number;
  previousVersions?: { value: any, updatedAt: string, updatedBy: string }[];
}

/**
 * Memory query options
 */
export interface MemoryQueryOptions {
  tags?: string[];
  createdBy?: string;
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'key';
  sortDirection?: 'asc' | 'desc';
}

/**
 * Shared memory system for agents
 */
export class SharedMemory {
  private memory: Map<string, MemoryEntry> = new Map();
  private librarianUrl: string;
  private missionId: string;
  private authenticatedApi: any; // Using any type to avoid circular dependencies

  constructor(librarianUrl: string, missionId: string, authenticatedApi: any) {
    this.librarianUrl = librarianUrl;
    this.missionId = missionId;
    this.authenticatedApi = authenticatedApi;
    this.loadMemory();
  }

  /**
   * Load memory from persistent storage
   */
  private async loadMemory(): Promise<void> {
    try {
      // Use authenticatedApi to ensure proper authorization header is included
      const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData`, {
        params: {
          storageType: 'mongo',
          collection: 'shared_memory',
          query: JSON.stringify({ missionId: this.missionId })
        }
      });

      if (response.data && Array.isArray(response.data)) {
        for (const entry of response.data) {
          this.memory.set(entry.id, entry);
        }
        console.log(`Loaded ${this.memory.size} shared memory entries for mission ${this.missionId}`);
      }
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error loading shared memory:', error);
    }
  }

  /**
   * Save memory to persistent storage
   */
  private async saveMemory(): Promise<void> {
    try {
      const entries = Array.from(this.memory.values());

      // Use authenticatedApi to ensure proper authorization header is included
      await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
        id: `shared_memory_${this.missionId}`,
        data: entries,
        storageType: 'mongo',
        collection: 'shared_memory'
      });

      console.log(`Saved ${entries.length} shared memory entries for mission ${this.missionId}`);
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error saving shared memory:', error);
    }
  }

  /**
   * Set a value in shared memory
   * @param key Key
   * @param value Value
   * @param agentId Agent ID
   * @param options Additional options
   * @returns Memory entry
   */
  async set(
    key: string,
    value: any,
    agentId: string,
    options: {
      tags?: string[];
      expiresAt?: string;
      accessControl?: { read: string[]; write: string[] };
    } = {}
  ): Promise<MemoryEntry> {
    // Check if entry already exists
    const existingEntry = Array.from(this.memory.values()).find(entry => entry.key === key);

    if (existingEntry) {
      // Check write access
      if (!this.hasWriteAccess(existingEntry, agentId)) {
        throw new Error(`Agent ${agentId} does not have write access to key ${key}`);
      }

      // Update existing entry
      const updatedEntry: MemoryEntry = {
        ...existingEntry,
        value,
        updatedAt: new Date().toISOString(),
        tags: options.tags || existingEntry.tags,
        expiresAt: options.expiresAt || existingEntry.expiresAt,
        accessControl: options.accessControl || existingEntry.accessControl,
        version: existingEntry.version + 1,
        previousVersions: [
          ...(existingEntry.previousVersions || []),
          {
            value: existingEntry.value,
            updatedAt: existingEntry.updatedAt,
            updatedBy: existingEntry.createdBy
          }
        ].slice(-5) // Keep only the last 5 versions
      };

      this.memory.set(existingEntry.id, updatedEntry);
      await this.saveMemory();

      return updatedEntry;
    } else {
      // Create new entry
      const newEntry: MemoryEntry = {
        id: uuidv4(),
        key,
        value,
        createdBy: agentId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: options.expiresAt,
        tags: options.tags || [],
        accessControl: options.accessControl || { read: ['all'], write: [agentId] },
        version: 1
      };

      this.memory.set(newEntry.id, newEntry);
      await this.saveMemory();

      return newEntry;
    }
  }

  /**
   * Get a value from shared memory
   * @param key Key
   * @param agentId Agent ID
   * @returns Value or undefined if not found
   */
  get(key: string, agentId: string): any {
    const entry = Array.from(this.memory.values()).find(entry => entry.key === key);

    if (!entry) {
      return undefined;
    }

    // Check read access
    if (!this.hasReadAccess(entry, agentId)) {
      throw new Error(`Agent ${agentId} does not have read access to key ${key}`);
    }

    // Check if expired
    if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
      return undefined;
    }

    return entry.value;
  }

  /**
   * Delete a value from shared memory
   * @param key Key
   * @param agentId Agent ID
   * @returns True if deleted, false if not found
   */
  async delete(key: string, agentId: string): Promise<boolean> {
    const entry = Array.from(this.memory.values()).find(entry => entry.key === key);

    if (!entry) {
      return false;
    }

    // Check write access
    if (!this.hasWriteAccess(entry, agentId)) {
      throw new Error(`Agent ${agentId} does not have write access to key ${key}`);
    }

    this.memory.delete(entry.id);
    await this.saveMemory();

    return true;
  }

  /**
   * Query shared memory
   * @param agentId Agent ID
   * @param options Query options
   * @returns Matching entries
   */
  query(agentId: string, options: MemoryQueryOptions = {}): MemoryEntry[] {
    let entries = Array.from(this.memory.values());

    // Filter by read access
    entries = entries.filter(entry => this.hasReadAccess(entry, agentId));

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      entries = entries.filter(entry =>
        options.tags!.some(tag => entry.tags.includes(tag))
      );
    }

    // Filter by creator
    if (options.createdBy) {
      entries = entries.filter(entry => entry.createdBy === options.createdBy);
    }

    // Filter by creation date
    if (options.createdAfter) {
      entries = entries.filter(entry =>
        new Date(entry.createdAt) >= new Date(options.createdAfter!)
      );
    }

    if (options.createdBefore) {
      entries = entries.filter(entry =>
        new Date(entry.createdAt) <= new Date(options.createdBefore!)
      );
    }

    // Filter by update date
    if (options.updatedAfter) {
      entries = entries.filter(entry =>
        new Date(entry.updatedAt) >= new Date(options.updatedAfter!)
      );
    }

    if (options.updatedBefore) {
      entries = entries.filter(entry =>
        new Date(entry.updatedAt) <= new Date(options.updatedBefore!)
      );
    }

    // Sort entries
    const sortBy = options.sortBy || 'updatedAt';
    const sortDirection = options.sortDirection || 'desc';

    entries.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];

      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    // Apply pagination
    if (options.offset) {
      entries = entries.slice(options.offset);
    }

    if (options.limit) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * Check if an agent has read access to an entry
   * @param entry Memory entry
   * @param agentId Agent ID
   * @returns True if the agent has read access
   */
  private hasReadAccess(entry: MemoryEntry, agentId: string): boolean {
    return entry.accessControl.read.includes('all') ||
           entry.accessControl.read.includes(agentId) ||
           entry.createdBy === agentId;
  }

  /**
   * Check if an agent has write access to an entry
   * @param entry Memory entry
   * @param agentId Agent ID
   * @returns True if the agent has write access
   */
  private hasWriteAccess(entry: MemoryEntry, agentId: string): boolean {
    return entry.accessControl.write.includes('all') ||
           entry.accessControl.write.includes(agentId) ||
           entry.createdBy === agentId;
  }

  /**
   * Get all keys in shared memory
   * @param agentId Agent ID
   * @returns All keys
   */
  getAllKeys(agentId: string): string[] {
    return Array.from(this.memory.values())
      .filter(entry => this.hasReadAccess(entry, agentId))
      .map(entry => entry.key);
  }

  /**
   * Clear all entries in shared memory
   * @param agentId Agent ID requesting the clear
   * @returns Number of entries cleared
   */
  async clear(agentId: string): Promise<number> {
    // Only allow clearing if the agent has write access to all entries
    const entries = Array.from(this.memory.values());
    const canClearAll = entries.every(entry => this.hasWriteAccess(entry, agentId));

    if (!canClearAll) {
      throw new Error(`Agent ${agentId} does not have permission to clear all shared memory`);
    }

    const count = this.memory.size;
    this.memory.clear();
    await this.saveMemory();

    return count;
  }
}
