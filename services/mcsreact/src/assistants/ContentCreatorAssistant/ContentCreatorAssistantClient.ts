import { AssistantClient } from "../shared/AssistantClient";
import { ScheduledContent, ApprovalRequest } from "./types";

export class ContentCreatorAssistantClient extends AssistantClient {
  constructor(apiBaseUrl: string, wsBaseUrl: string) {
    super(apiBaseUrl, wsBaseUrl);
  }

  async getScheduledContent(conversationId: string): Promise<ScheduledContent[]> {
    const response = await fetch(`${this.apiBaseUrl}/content-calendar?conversationId=${conversationId}`);
    if (!response.ok) {
      throw new Error("Failed to fetch scheduled content");
    }
    return response.json();
  }

  async getApprovalRequests(conversationId: string): Promise<ApprovalRequest[]> {
    const response = await fetch(`${this.apiBaseUrl}/approvals?conversationId=${conversationId}`);
    if (!response.ok) {
      throw new Error("Failed to fetch approval requests");
    }
    return response.json();
  }

  async updateApprovalRequestStatus(
    conversationId: string,
    requestId: string,
    status: "approved" | "rejected"
  ): Promise<ApprovalRequest> {
    const response = await fetch(`${this.apiBaseUrl}/approvals/${requestId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status, conversationId }),
    });
    if (!response.ok) {
      throw new Error("Failed to update approval request status");
    }
    return response.json();
  }
}

export default ContentCreatorAssistantClient;