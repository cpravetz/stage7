import { AssistantClient } from '../shared/AssistantClient';
import { ImprovementItem, Customer, SupportTicket, Article, Message, AgentPerformance, ResponseTemplate } from './types';

export class CustomerSupportAssistantClient extends AssistantClient {
  public async getImprovementItems(conversationId: string): Promise<ImprovementItem[]> {
    return this.request<ImprovementItem[]>('GET', `/conversations/${conversationId}/improvement-items`);
  }

  public async addImprovementItem(conversationId: string, suggestion: string, action: string): Promise<ImprovementItem> {
    return this.request<ImprovementItem>('POST', `/conversations/${conversationId}/improvement-items`, { suggestion, action });
  }

  public async updateImprovementItemStatus(
    conversationId: string,
    itemId: string,
    completed: boolean
  ): Promise<void> {
    await this.request<void>('POST', `/conversations/${conversationId}/improvement-items/${itemId}/status`, { completed });
  }

  public async getCustomer360View(conversationId: string, customerId: string): Promise<Customer> {
    return this.request<Customer>('GET', `/conversations/${conversationId}/customers/${customerId}/360-view`);
  }

  public async getEscalatedTickets(conversationId: string): Promise<SupportTicket[]> {
    return this.request<SupportTicket[]>('GET', `/conversations/${conversationId}/escalated-tickets`);
  }

  public async assignEscalatedTicket(conversationId: string, ticketId: string, assignedAgent: string): Promise<void> {
    await this.request<void>('POST', `/conversations/${conversationId}/escalated-tickets/${ticketId}/assign`, { assignedAgent });
  }

  public async updateEscalatedTicketStatus(conversationId: string, ticketId: string, status: SupportTicket['status']): Promise<void> {
    await this.request<void>('POST', `/conversations/${conversationId}/escalated-tickets/${ticketId}/status`, { status });
  }

  public async searchKnowledgeBase(conversationId: string, query: string): Promise<Article[]> {
    return this.request<Article[]>('GET', `/conversations/${conversationId}/knowledge-base/search?query=${encodeURIComponent(query)}`);
  }

  public async getEmailMessages(conversationId: string): Promise<Message[]> {
    return this.request<Message[]>('GET', `/conversations/${conversationId}/inbox/email`);
  }

  public async getChatMessages(conversationId: string): Promise<Message[]> {
    return this.request<Message[]>('GET', `/conversations/${conversationId}/inbox/chat`);
  }

  public async getSocialMessages(conversationId: string): Promise<Message[]> {
    return this.request<Message[]>('GET', `/conversations/${conversationId}/inbox/social`);
  }

  public async getPerformanceAnalytics(conversationId: string): Promise<AgentPerformance[]> {
    return this.request<AgentPerformance[]>('GET', `/conversations/${conversationId}/performance-analytics`);
  }

  public async getResponseTemplates(conversationId: string): Promise<ResponseTemplate[]> {
    return this.request<ResponseTemplate[]>('GET', `/conversations/${conversationId}/response-templates`);
  }

  public async searchResponseTemplates(conversationId: string, query: string): Promise<ResponseTemplate[]> {
    return this.request<ResponseTemplate[]>('GET', `/conversations/${conversationId}/response-templates/search?query=${encodeURIComponent(query)}`);
  }

  public async createResponseTemplate(conversationId: string, name: string, category: string, content: string): Promise<ResponseTemplate> {
    return this.request<ResponseTemplate>('POST', `/conversations/${conversationId}/response-templates`, { name, category, content });
  }

  public async updateResponseTemplate(conversationId: string, id: string, name: string, category: string, content: string): Promise<ResponseTemplate> {
    return this.request<ResponseTemplate>('PUT', `/conversations/${conversationId}/response-templates/${id}`, { name, category, content });
  }

  public async deleteResponseTemplate(conversationId: string, id: string): Promise<void> {
    await this.request<void>('DELETE', `/conversations/${conversationId}/response-templates/${id}`);
  }

  public async getTickets(conversationId: string): Promise<SupportTicket[]> {
    return this.request<SupportTicket[]>('GET', `/conversations/${conversationId}/tickets`);
  }
}
