import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class LegalTemplateTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'LegalTemplateTool',
      description: 'Accesses a comprehensive database of legal document templates for various jurisdictions and document types.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the legal template tool.',
            enum: ['findTemplates', 'getTemplateDetails', 'customizeTemplate'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific legal template action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async findTemplates(documentType: string, jurisdiction: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'findTemplates', payload: { documentType, jurisdiction } }, conversationId);
  }

  public async getTemplateDetails(templateId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'getTemplateDetails', payload: { templateId } }, conversationId);
  }

  public async customizeTemplate(templateId: string, parameters: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'customizeTemplate', payload: { templateId, parameters } }, conversationId);
  }
}
