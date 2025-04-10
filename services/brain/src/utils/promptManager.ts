import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { analyzeError } from '@cktmcs/errorhandler';

/**
 * Prompt template
 */
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  variables: string[];
  tags: string[];
  category: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  author: string;
  usage: {
    count: number;
    lastUsed: string;
  };
  metrics: {
    successRate: number;
    averageTokenCount: number;
    averageResponseTime: number;
  };
  examples: Array<{
    variables: Record<string, string>;
    result: string;
  }>;
}

/**
 * Prompt test result
 */
export interface PromptTestResult {
  templateId: string;
  variables: Record<string, string>;
  renderedPrompt: string;
  response: string;
  success: boolean;
  tokenCount: number;
  responseTime: number;
  feedback?: {
    rating: number;
    comments: string;
  };
}

/**
 * Prompt manager
 */
export class PromptManager {
  private templates: Map<string, PromptTemplate> = new Map();
  private dataFilePath: string;
  private testResults: PromptTestResult[] = [];
  
  constructor(dataDirectory: string = path.join(__dirname, '..', '..', 'data')) {
    this.dataFilePath = path.join(dataDirectory, 'prompt-templates.json');
    this.loadTemplates();
    
    // Set up periodic saving
    setInterval(() => this.saveTemplates(), 5 * 60 * 1000); // Save every 5 minutes
  }
  
  /**
   * Load templates from disk
   */
  private async loadTemplates(): Promise<void> {
    try {
      // Ensure the data directory exists
      const dataDir = path.dirname(this.dataFilePath);
      await fs.mkdir(dataDir, { recursive: true });
      
      // Try to read the templates file
      const data = await fs.readFile(this.dataFilePath, 'utf-8');
      const templatesArray = JSON.parse(data) as PromptTemplate[];
      
      // Convert array to map
      this.templates = new Map(
        templatesArray.map(template => [template.id, template])
      );
      
      console.log(`Loaded ${this.templates.size} prompt templates`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log('No prompt templates file found, starting with empty templates');
        await this.createDefaultTemplates();
      } else {
        console.error('Error loading prompt templates:', error);
        analyzeError(error as Error);
      }
    }
  }
  
  /**
   * Create default templates
   */
  private async createDefaultTemplates(): Promise<void> {
    // Create some default templates
    const defaultTemplates: PromptTemplate[] = [
      {
        id: uuidv4(),
        name: 'General Question',
        description: 'A general question template',
        template: 'Answer the following question: {{question}}',
        variables: ['question'],
        tags: ['general', 'question'],
        category: 'general',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: 'system',
        usage: {
          count: 0,
          lastUsed: new Date().toISOString()
        },
        metrics: {
          successRate: 0,
          averageTokenCount: 0,
          averageResponseTime: 0
        },
        examples: [
          {
            variables: { question: 'What is the capital of France?' },
            result: 'The capital of France is Paris.'
          }
        ]
      },
      {
        id: uuidv4(),
        name: 'Code Generation',
        description: 'A template for generating code',
        template: 'Write {{language}} code to {{task}}. Include comments to explain your code.',
        variables: ['language', 'task'],
        tags: ['code', 'programming'],
        category: 'development',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: 'system',
        usage: {
          count: 0,
          lastUsed: new Date().toISOString()
        },
        metrics: {
          successRate: 0,
          averageTokenCount: 0,
          averageResponseTime: 0
        },
        examples: [
          {
            variables: { 
              language: 'JavaScript', 
              task: 'create a function that calculates the factorial of a number' 
            },
            result: '```javascript\n/**\n * Calculates the factorial of a number\n * @param {number} n - The number to calculate factorial for\n * @returns {number} The factorial of n\n */\nfunction factorial(n) {\n  if (n === 0 || n === 1) {\n    return 1;\n  }\n  return n * factorial(n - 1);\n}\n```'
          }
        ]
      },
      {
        id: uuidv4(),
        name: 'Image Description',
        description: 'A template for describing images',
        template: 'Describe the following image in detail: {{image_content}}',
        variables: ['image_content'],
        tags: ['image', 'description', 'vision'],
        category: 'vision',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: 'system',
        usage: {
          count: 0,
          lastUsed: new Date().toISOString()
        },
        metrics: {
          successRate: 0,
          averageTokenCount: 0,
          averageResponseTime: 0
        },
        examples: []
      }
    ];
    
    // Add default templates
    for (const template of defaultTemplates) {
      this.templates.set(template.id, template);
    }
    
    // Save templates
    await this.saveTemplates();
  }
  
  /**
   * Save templates to disk
   */
  private async saveTemplates(): Promise<void> {
    try {
      // Convert map to array for serialization
      const templatesArray = Array.from(this.templates.values());
      
      // Save to file
      await fs.writeFile(
        this.dataFilePath,
        JSON.stringify(templatesArray, null, 2),
        'utf-8'
      );
      
      console.log(`Saved ${templatesArray.length} prompt templates`);
    } catch (error) {
      console.error('Error saving prompt templates:', error);
      analyzeError(error as Error);
    }
  }
  
  /**
   * Get all templates
   * @returns All templates
   */
  getAllTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }
  
  /**
   * Get a template by ID
   * @param id Template ID
   * @returns Template or undefined
   */
  getTemplate(id: string): PromptTemplate | undefined {
    return this.templates.get(id);
  }
  
  /**
   * Get templates by category
   * @param category Category
   * @returns Templates in the category
   */
  getTemplatesByCategory(category: string): PromptTemplate[] {
    return Array.from(this.templates.values())
      .filter(template => template.category === category);
  }
  
  /**
   * Get templates by tag
   * @param tag Tag
   * @returns Templates with the tag
   */
  getTemplatesByTag(tag: string): PromptTemplate[] {
    return Array.from(this.templates.values())
      .filter(template => template.tags.includes(tag));
  }
  
  /**
   * Create a new template
   * @param template Template data
   * @returns Created template
   */
  createTemplate(template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usage' | 'metrics'>): PromptTemplate {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const newTemplate: PromptTemplate = {
      ...template,
      id,
      createdAt: now,
      updatedAt: now,
      usage: {
        count: 0,
        lastUsed: now
      },
      metrics: {
        successRate: 0,
        averageTokenCount: 0,
        averageResponseTime: 0
      }
    };
    
    this.templates.set(id, newTemplate);
    this.saveTemplates();
    
    return newTemplate;
  }
  
  /**
   * Update a template
   * @param id Template ID
   * @param updates Updates to apply
   * @returns Updated template or undefined
   */
  updateTemplate(
    id: string,
    updates: Partial<Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usage' | 'metrics'>>
  ): PromptTemplate | undefined {
    const template = this.templates.get(id);
    if (!template) return undefined;
    
    // Create a new version if the template text changes
    if (updates.template && updates.template !== template.template) {
      const versionParts = template.version.split('.');
      const newVersion = `${versionParts[0]}.${parseInt(versionParts[1]) + 1}.0`;
      updates.version = newVersion;
    }
    
    const updatedTemplate: PromptTemplate = {
      ...template,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    this.templates.set(id, updatedTemplate);
    this.saveTemplates();
    
    return updatedTemplate;
  }
  
  /**
   * Delete a template
   * @param id Template ID
   * @returns True if deleted, false if not found
   */
  deleteTemplate(id: string): boolean {
    const deleted = this.templates.delete(id);
    if (deleted) {
      this.saveTemplates();
    }
    return deleted;
  }
  
  /**
   * Render a prompt template with variables
   * @param templateId Template ID
   * @param variables Variables to use
   * @returns Rendered prompt
   */
  renderTemplate(templateId: string, variables: Record<string, string>): string {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template with ID ${templateId} not found`);
    }
    
    // Update usage statistics
    template.usage.count++;
    template.usage.lastUsed = new Date().toISOString();
    
    // Render template
    let renderedPrompt = template.template;
    
    for (const [key, value] of Object.entries(variables)) {
      renderedPrompt = renderedPrompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    
    return renderedPrompt;
  }
  
  /**
   * Test a prompt template
   * @param templateId Template ID
   * @param variables Variables to use
   * @param modelName Model name to use
   * @returns Test result
   */
  async testTemplate(
    templateId: string,
    variables: Record<string, string>,
    modelName: string
  ): Promise<PromptTestResult> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template with ID ${templateId} not found`);
    }
    
    // Render template
    const renderedPrompt = this.renderTemplate(templateId, variables);
    
    // TODO: Call the model to get a response
    // For now, we'll just return a mock result
    const startTime = Date.now();
    const response = `This is a mock response for the prompt: ${renderedPrompt}`;
    const endTime = Date.now();
    
    const result: PromptTestResult = {
      templateId,
      variables,
      renderedPrompt,
      response,
      success: true,
      tokenCount: renderedPrompt.split(' ').length,
      responseTime: endTime - startTime
    };
    
    // Store test result
    this.testResults.push(result);
    
    // Update template metrics
    this.updateTemplateMetrics(templateId, result);
    
    return result;
  }
  
  /**
   * Update template metrics
   * @param templateId Template ID
   * @param result Test result
   */
  private updateTemplateMetrics(templateId: string, result: PromptTestResult): void {
    const template = this.templates.get(templateId);
    if (!template) return;
    
    const { metrics } = template;
    const weight = 0.1; // Weight for new metrics
    
    // Update success rate
    metrics.successRate = metrics.successRate === 0
      ? (result.success ? 1 : 0)
      : (metrics.successRate * (1 - weight)) + (result.success ? weight : 0);
    
    // Update token count
    metrics.averageTokenCount = metrics.averageTokenCount === 0
      ? result.tokenCount
      : (metrics.averageTokenCount * (1 - weight)) + (result.tokenCount * weight);
    
    // Update response time
    metrics.averageResponseTime = metrics.averageResponseTime === 0
      ? result.responseTime
      : (metrics.averageResponseTime * (1 - weight)) + (result.responseTime * weight);
  }
  
  /**
   * Get test results for a template
   * @param templateId Template ID
   * @returns Test results
   */
  getTestResults(templateId: string): PromptTestResult[] {
    return this.testResults.filter(result => result.templateId === templateId);
  }
  
  /**
   * Add an example to a template
   * @param templateId Template ID
   * @param variables Variables used
   * @param result Result
   * @returns Updated template or undefined
   */
  addExample(
    templateId: string,
    variables: Record<string, string>,
    result: string
  ): PromptTemplate | undefined {
    const template = this.templates.get(templateId);
    if (!template) return undefined;
    
    template.examples.push({ variables, result });
    template.updatedAt = new Date().toISOString();
    
    this.saveTemplates();
    
    return template;
  }
  
  /**
   * Find similar templates
   * @param text Text to search for
   * @returns Similar templates
   */
  findSimilarTemplates(text: string): PromptTemplate[] {
    const searchTerms = text.toLowerCase().split(' ');
    
    return Array.from(this.templates.values())
      .filter(template => {
        const templateText = `${template.name} ${template.description} ${template.template} ${template.tags.join(' ')}`.toLowerCase();
        return searchTerms.some(term => templateText.includes(term));
      })
      .sort((a, b) => {
        // Sort by usage count (descending)
        return b.usage.count - a.usage.count;
      });
  }
}
