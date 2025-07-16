import { v4 as uuidv4 } from 'uuid';
import { analyzeError } from '@cktmcs/errorhandler';
import { KnowledgeDomain } from './SpecializationFramework';
import { AuthenticatedApiClient } from '@cktmcs/shared';

/**
 * Knowledge item
 */
export interface KnowledgeItem {
  id: string;
  domainId: string;
  title: string;
  content: string;
  format: 'text' | 'json' | 'markdown' | 'html' | 'code';
  tags: string[];
  source?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  metadata: Record<string, any>;
}

/**
 * Knowledge query options
 */
export interface KnowledgeQueryOptions {
  domains?: string[];
  tags?: string[];
  query?: string;
  limit?: number;
  offset?: number;
}

/**
 * Domain knowledge system
 */
export class DomainKnowledge {
  private knowledgeItems: Map<string, KnowledgeItem> = new Map();
  private domains: Map<string, KnowledgeDomain>;
  private librarianUrl: string;
  private brainUrl: string;
  private authenticatedApi: AuthenticatedApiClient;

  constructor(domains: Map<string, KnowledgeDomain>, librarianUrl: string, brainUrl: string) {
    this.domains = domains;
    this.librarianUrl = librarianUrl;
    this.brainUrl = brainUrl;

    // Create a temporary BaseEntity for authentication
    const tempEntity = {
      id: 'domain-knowledge',
      componentType: 'AgentSet',
      url: 'agentset:5100',
      port: '5100',
      postOfficeUrl: 'postoffice:5020'
    };

    // Create authenticated API client
    this.authenticatedApi = new AuthenticatedApiClient(tempEntity);

    this.loadKnowledgeItems();
  }

  /**
   * Load knowledge items from persistent storage
   */
  private async loadKnowledgeItems(): Promise<void> {
    try {
      // Use queryData instead of loadData to get the document by ID
      const response = await this.authenticatedApi.post(`http://${this.librarianUrl}/queryData`, {
        collection: 'domain_knowledge',
        query: { _id: 'domain_knowledge' },
        limit: 1
      });

      // Check if we got data back
      if (response.data && response.data.data && Array.isArray(response.data.data) && response.data.data.length > 0) {
        const document = response.data.data[0];
        // The actual knowledge items array should be in the document's data field
        const items = Array.isArray(document) ? document : (document.data || document);

        if (Array.isArray(items)) {
          for (const item of items) {
            if (item && item.id) {
              this.knowledgeItems.set(item.id, item);
            }
          }
          console.log(`Loaded ${this.knowledgeItems.size} knowledge items`);
        } else {
          console.log('No valid knowledge items array found in document');
        }
      } else {
        console.log('No domain knowledge found in storage');
      }
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error loading knowledge items:', error);
    }
  }

  /**
   * Save knowledge items to persistent storage
   */
  private async saveKnowledgeItems(): Promise<void> {
    try {
      const items = Array.from(this.knowledgeItems.values());

      await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
        id: 'domain_knowledge',
        data: items,
        storageType: 'mongo',
        collection: 'domain_knowledge'
      });

      console.log(`Saved ${items.length} knowledge items`);
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error saving knowledge items:', error);
    }
  }

  /**
   * Add a knowledge item
   * @param item Knowledge item to add
   * @returns Added knowledge item
   */
  async addKnowledgeItem(item: Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<KnowledgeItem> {
    // Check if domain exists
    if (!this.domains.has(item.domainId)) {
      throw new Error(`Domain ${item.domainId} not found`);
    }

    // Create knowledge item
    const newItem: KnowledgeItem = {
      ...item,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };

    // Store knowledge item
    this.knowledgeItems.set(newItem.id, newItem);
    await this.saveKnowledgeItems();

    return newItem;
  }

  /**
   * Update a knowledge item
   * @param id Knowledge item ID
   * @param updates Updates to apply
   * @returns Updated knowledge item
   */
  async updateKnowledgeItem(
    id: string,
    updates: Partial<Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt' | 'version'>>
  ): Promise<KnowledgeItem> {
    // Check if knowledge item exists
    const item = this.knowledgeItems.get(id);

    if (!item) {
      throw new Error(`Knowledge item ${id} not found`);
    }

    // Check if domain exists
    if (updates.domainId && !this.domains.has(updates.domainId)) {
      throw new Error(`Domain ${updates.domainId} not found`);
    }

    // Update knowledge item
    const updatedItem: KnowledgeItem = {
      ...item,
      ...updates,
      updatedAt: new Date().toISOString(),
      version: item.version + 1
    };

    // Store updated knowledge item
    this.knowledgeItems.set(id, updatedItem);
    await this.saveKnowledgeItems();

    return updatedItem;
  }

  /**
   * Delete a knowledge item
   * @param id Knowledge item ID
   * @returns True if deleted, false if not found
   */
  async deleteKnowledgeItem(id: string): Promise<boolean> {
    // Check if knowledge item exists
    if (!this.knowledgeItems.has(id)) {
      return false;
    }

    // Delete knowledge item
    this.knowledgeItems.delete(id);
    await this.saveKnowledgeItems();

    return true;
  }

  /**
   * Get a knowledge item by ID
   * @param id Knowledge item ID
   * @returns Knowledge item or undefined if not found
   */
  getKnowledgeItem(id: string): KnowledgeItem | undefined {
    return this.knowledgeItems.get(id);
  }

  /**
   * Query knowledge items
   * @param options Query options
   * @returns Matching knowledge items
   */
  queryKnowledgeItems(options: KnowledgeQueryOptions = {}): KnowledgeItem[] {
    let items = Array.from(this.knowledgeItems.values());

    // Filter by domains
    if (options.domains && options.domains.length > 0) {
      items = items.filter(item => options.domains!.includes(item.domainId));
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      items = items.filter(item =>
        options.tags!.some(tag => item.tags.includes(tag))
      );
    }

    // Filter by query
    if (options.query) {
      const query = options.query.toLowerCase();

      items = items.filter(item =>
        item.title.toLowerCase().includes(query) ||
        item.content.toLowerCase().includes(query) ||
        item.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Apply pagination
    if (options.offset) {
      items = items.slice(options.offset);
    }

    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  /**
   * Get knowledge items for a domain
   * @param domainId Domain ID
   * @returns Knowledge items for the domain
   */
  getKnowledgeItemsForDomain(domainId: string): KnowledgeItem[] {
    return Array.from(this.knowledgeItems.values())
      .filter(item => item.domainId === domainId);
  }

  /**
   * Generate domain-specific context for a task
   * @param domainIds Domain IDs
   * @param taskDescription Task description
   * @returns Domain-specific context
   */
  async generateDomainContext(
    domainIds: string[],
    taskDescription: string
  ): Promise<string> {
    try {
      // Get relevant knowledge items
      const relevantItems: KnowledgeItem[] = [];

      for (const domainId of domainIds) {
        const domainItems = this.getKnowledgeItemsForDomain(domainId);

        // Filter items by relevance to task
        const filteredItems = await this.filterItemsByRelevance(domainItems, taskDescription);

        relevantItems.push(...filteredItems);
      }

      if (relevantItems.length === 0) {
        return ''; // No relevant items
      }

      // Generate context
      let context = 'Domain-Specific Knowledge:\n\n';

      for (const item of relevantItems) {
        context += `## ${item.title}\n\n`;
        context += `${item.content}\n\n`;

        if (item.source) {
          context += `Source: ${item.source}\n\n`;
        }
      }

      return context;
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error generating domain context:', error);
      return '';
    }
  }

  /**
   * Filter knowledge items by relevance to a task
   * @param items Knowledge items
   * @param taskDescription Task description
   * @returns Relevant knowledge items
   */
  private async filterItemsByRelevance(
    items: KnowledgeItem[],
    taskDescription: string
  ): Promise<KnowledgeItem[]> {
    if (items.length === 0) {
      return [];
    }

    try {
      // Use LLM to determine relevance with authenticated request
      const response = await this.authenticatedApi.post(`http://${this.brainUrl}/chat`, {
        exchanges: [
          {
            role: 'system',
            content: 'You are an AI assistant that helps determine the relevance of knowledge items to a task. You will be given a task description and a list of knowledge items. Your job is to identify which items are relevant to the task and return their indices.'
          },
          {
            role: 'user',
            content: `Task Description: ${taskDescription}\n\nKnowledge Items:\n${items.map((item, index) => `${index + 1}. ${item.title}: ${item.content.substring(0, 100)}...`).join('\n')}\n\nPlease return the indices of the relevant knowledge items as a comma-separated list (e.g., "1,3,5"). If none are relevant, return "none".`
          }
        ],
        optimization: 'accuracy'
      });

      // Parse LLM response
      const llmResponse = response.data.response;

      // Extract indices
      const indexMatch = llmResponse.match(/(\d+(?:,\s*\d+)*)/);

      if (!indexMatch || llmResponse.toLowerCase().includes('none')) {
        return []; // No relevant items
      }

      const indices = indexMatch[1].split(',').map((index: string) => parseInt(index.trim()) - 1);

      // Filter items by indices
      return indices
        .filter((index: number) => index >= 0 && index < items.length)
        .map((index: number) => items[index]);
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error filtering items by relevance:', error);

      // Fall back to simple keyword matching
      const keywords = taskDescription.toLowerCase().split(/\s+/);

      return items.filter(item => {
        const itemText = `${item.title} ${item.content}`.toLowerCase();
        return keywords.some(keyword => itemText.includes(keyword));
      });
    }
  }

  /**
   * Import knowledge from external source
   * @param domainId Domain ID
   * @param source Source URL or identifier
   * @param format Format of the source
   * @returns Imported knowledge items
   */
  async importKnowledge(
    domainId: string,
    source: string,
    format: 'url' | 'file' | 'api'
  ): Promise<KnowledgeItem[]> {
    try {
      // Check if domain exists
      if (!this.domains.has(domainId)) {
        throw new Error(`Domain ${domainId} not found`);
      }

      let content: string;

      // Fetch content from source
      if (format === 'url') {
        const response = await this.authenticatedApi.get(source);
        content = response.data;
      } else if (format === 'api') {
        const response = await this.authenticatedApi.get(source);
        content = JSON.stringify(response.data);
      } else {
        throw new Error(`Unsupported format: ${format}`);
      }

      // Use LLM to extract knowledge items with authenticated request
      const response = await this.authenticatedApi.post(`http://${this.brainUrl}/chat`, {
        exchanges: [
          {
            role: 'system',
            content: 'You are an AI assistant that helps extract knowledge items from content. You will be given some content and a domain. Your job is to identify distinct knowledge items and format them as JSON objects with title, content, and tags properties.'
          },
          {
            role: 'user',
            content: `Domain: ${this.domains.get(domainId)?.name}\n\nContent:\n${content.substring(0, 10000)}\n\nPlease extract knowledge items from this content and format them as JSON objects with title, content, and tags properties. Return the items as a JSON array.`
          }
        ],
        optimization: 'accuracy'
      });

      // Parse LLM response
      const llmResponse = response.data.response;

      // Extract JSON
      const jsonMatch = llmResponse.match(/\[\s*\{.*\}\s*\]/s);

      if (!jsonMatch) {
        throw new Error('Failed to extract knowledge items from content');
      }

      const extractedItems = JSON.parse(jsonMatch[0]);

      // Add knowledge items
      const addedItems: KnowledgeItem[] = [];

      for (const extractedItem of extractedItems) {
        const item = await this.addKnowledgeItem({
          domainId,
          title: extractedItem.title,
          content: extractedItem.content,
          format: 'text',
          tags: extractedItem.tags,
          source,
          metadata: { importedAt: new Date().toISOString() }
        });

        addedItems.push(item);
      }

      return addedItems;
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error importing knowledge:', error);
      throw error;
    }
  }
}
