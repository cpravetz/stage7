import { Tool } from '../../Tool';
import { ICoreEngineClient, JsonSchema } from '../../types';

export class BillingTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'BillingTool',
      description: 'Handles all billing operations including payments, deposits, charges, refunds, and invoice generation',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the billing tool.',
            enum: ['processPayment', 'addCharges', 'generateInvoice', 'handleRefunds', 'splitBilling'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific billing action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  async processPayment(guestId: string, amount: number, conversationId: string): Promise<any> {
    return this.execute({ action: 'processPayment', payload: { guestId, amount } }, conversationId);
  }

  async addCharges(roomNumber: string, items: any[], conversationId: string): Promise<any> {
    return this.execute({ action: 'addCharges', payload: { roomNumber, items } }, conversationId);
  }

  async generateInvoice(reservationId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'generateInvoice', payload: { reservationId } }, conversationId);
  }

  async handleRefunds(transactionId: string, conversationId: string): Promise<any> {
    return this.execute({ action: 'handleRefunds', payload: { transactionId } }, conversationId);
  }

  async splitBilling(reservationId: string, allocations: any[], conversationId: string): Promise<any> {
    return this.execute({ action: 'splitBilling', payload: { reservationId, allocations } }, conversationId);
  }
}