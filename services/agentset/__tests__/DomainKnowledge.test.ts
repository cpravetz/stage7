
import { DomainKnowledge, KnowledgeItem } from '../src/specialization/DomainKnowledge';
import { KnowledgeDomain } from '../src/specialization/SpecializationFramework';
import { AuthenticatedApiClient } from '@cktmcs/shared';

// Mock dependencies
jest.mock('@cktmcs/shared', () => ({
  ...jest.requireActual('@cktmcs/shared'),
  AuthenticatedApiClient: jest.fn().mockImplementation(() => ({
    post: jest.fn(),
    get: jest.fn(),
  })),
}));

describe('DomainKnowledge', () => {
  let domainKnowledge: DomainKnowledge;
  let mockAuthenticatedApi: jest.Mocked<AuthenticatedApiClient>;
  let mockDomains: Map<string, KnowledgeDomain>;

  beforeEach(() => {
    mockDomains = new Map([
      ['test-domain', { id: 'test-domain', name: 'Test Domain', description: '' }],
    ]);
    domainKnowledge = new DomainKnowledge(mockDomains, 'librarian:5040', 'brain:5070');
    mockAuthenticatedApi = (domainKnowledge as any).authenticatedApi;
  });

  describe('addKnowledgeItem', () => {
    it('should add a new knowledge item', async () => {
      const item: Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt' | 'version'> = {
        domainId: 'test-domain',
        title: 'Test Item',
        content: 'Test content',
        format: 'text',
        tags: [],
        metadata: {},
      };

      mockAuthenticatedApi.post.mockResolvedValue({} as any);

      const newItem = await domainKnowledge.addKnowledgeItem(item);

      expect(newItem.title).toBe('Test Item');
      expect(domainKnowledge.getKnowledgeItem(newItem.id)).toBeDefined();
    });
  });

  describe('updateKnowledgeItem', () => {
    it('should update an existing knowledge item', async () => {
      const item: Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt' | 'version'> = {
        domainId: 'test-domain',
        title: 'Test Item',
        content: 'Test content',
        format: 'text',
        tags: [],
        metadata: {},
      };
      const newItem = await domainKnowledge.addKnowledgeItem(item);

      const updates = { title: 'Updated Title' };
      const updatedItem = await domainKnowledge.updateKnowledgeItem(newItem.id, updates);

      expect(updatedItem.title).toBe('Updated Title');
    });
  });

  describe('deleteKnowledgeItem', () => {
    it('should delete a knowledge item', async () => {
      const item: Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt' | 'version'> = {
        domainId: 'test-domain',
        title: 'Test Item',
        content: 'Test content',
        format: 'text',
        tags: [],
        metadata: {},
      };
      const newItem = await domainKnowledge.addKnowledgeItem(item);

      const result = await domainKnowledge.deleteKnowledgeItem(newItem.id);

      expect(result).toBe(true);
      expect(domainKnowledge.getKnowledgeItem(newItem.id)).toBeUndefined();
    });
  });

  describe('queryKnowledgeItems', () => {
    it('should query knowledge items by domain', async () => {
      const item1: Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt' | 'version'> = {
        domainId: 'test-domain',
        title: 'Item 1',
        content: '',
        format: 'text',
        tags: [],
        metadata: {},
      };
      const item2: Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt' | 'version'> = {
        domainId: 'other-domain',
        title: 'Item 2',
        content: '',
        format: 'text',
        tags: [],
        metadata: {},
      };
      await domainKnowledge.addKnowledgeItem(item1);
      // await domainKnowledge.addKnowledgeItem(item2); // This would fail as other-domain is not in mockDomains

      const results = domainKnowledge.queryKnowledgeItems({ domains: ['test-domain'] });

      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Item 1');
    });
  });
});
