
import { PromptManager, PromptTemplate } from '../src/utils/promptManager';
import fs from 'fs/promises';

// Mock dependencies
jest.mock('fs/promises');

describe('PromptManager', () => {
  let promptManager: PromptManager;

  beforeEach(() => {
    // Reset the singleton instance
    jest.resetModules();
    promptManager = new PromptManager();
  });

  describe('createTemplate', () => {
    it('should create a new prompt template', () => {
      const templateData: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usage' | 'metrics'> = {
        name: 'Test Template',
        description: 'A test template',
        template: 'Hello, {{name}}!',
        variables: ['name'],
        tags: ['test'],
        category: 'test',
        version: '1.0.0',
        author: 'tester',
        examples: [],
      };

      const newTemplate = promptManager.createTemplate(templateData);

      expect(newTemplate.name).toBe('Test Template');
      expect(promptManager.getTemplate(newTemplate.id)).toBeDefined();
    });
  });

  describe('renderTemplate', () => {
    it('should render a prompt template with variables', () => {
      const templateData: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usage' | 'metrics'> = {
        name: 'Test Template',
        description: 'A test template',
        template: 'Hello, {{name}}!',
        variables: ['name'],
        tags: ['test'],
        category: 'test',
        version: '1.0.0',
        author: 'tester',
        examples: [],
      };
      const newTemplate = promptManager.createTemplate(templateData);

      const rendered = promptManager.renderTemplate(newTemplate.id, { name: 'World' });

      expect(rendered).toBe('Hello, World!');
    });
  });

  describe('findSimilarTemplates', () => {
    it('should find similar templates based on a search query', () => {
      const templateData1: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usage' | 'metrics'> = {
        name: 'Greeting Template',
        description: 'A template for greetings',
        template: 'Hello, {{name}}!',
        variables: ['name'],
        tags: ['greeting'],
        category: 'general',
        version: '1.0.0',
        author: 'tester',
        examples: [],
      };
      promptManager.createTemplate(templateData1);

      const results = promptManager.findSimilarTemplates('greeting');

      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Greeting Template');
    });
  });
});
