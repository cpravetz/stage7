// Centralized assistant client instances
// All requests go through PostOffice (port 5020) which proxies to the appropriate assistant API
import { AssistantClient } from './AssistantClient';
import { API_BASE_URL, WS_URL } from '../../config';

// PM Assistant - Proxied through PostOffice
export const pmAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/pm-assistant`,
  `${WS_URL}/ws/pm-assistant/conversations`
);

// Sales Assistant - Proxied through PostOffice
export const salesAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/sales-assistant`,
  `${WS_URL}/ws/sales-assistant/conversations`
);

// Marketing Assistant - Proxied through PostOffice
export const marketingAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/marketing-assistant`,
  `${WS_URL}/ws/marketing-assistant/conversations`
);

// HR Assistant - Proxied through PostOffice
export const hrAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/hr-assistant`,
  `${WS_URL}/ws/hr-assistant/conversations`
);

// Finance Assistant - Proxied through PostOffice
export const financeAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/finance-assistant`,
  `${WS_URL}/ws/finance-assistant/conversations`
);

// Support Assistant - Proxied through PostOffice
export const supportAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/support-assistant`,
  `${WS_URL}/ws/support-assistant/conversations`
);

// Legal Assistant - Proxied through PostOffice
export const legalAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/legal-assistant`,
  `${WS_URL}/ws/legal-assistant/conversations`
);

// Healthcare Assistant - Proxied through PostOffice
export const healthcareAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/healthcare-assistant`,
  `${WS_URL}/ws/healthcare-assistant/conversations`
);

// Education Assistant - Proxied through PostOffice
export const educationAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/education-assistant`,
  `${WS_URL}/ws/education-assistant/conversations`
);

// Event Assistant - Proxied through PostOffice
export const eventAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/event-assistant`,
  `${WS_URL}/ws/event-assistant/conversations`
);

// Executive Assistant - Proxied through PostOffice
export const executiveAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/executive-assistant`,
  `${WS_URL}/ws/executive-assistant/conversations`
);

// Career Assistant - Proxied through PostOffice
export const careerAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/career-assistant`,
  `${WS_URL}/ws/career-assistant/conversations`
);

// Hotel Operations Assistant - Proxied through PostOffice
export const hotelOperationsAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/hotel-ops-assistant`,
  `${WS_URL}/ws/hotel-ops-assistant/conversations`
);

// Restaurant Operations Assistant - Proxied through PostOffice
export const restaurantOperationsAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/restaurant-ops-assistant`,
  `${WS_URL}/ws/restaurant-ops-assistant/conversations`
);

// Songwriter Assistant - Proxied through PostOffice
export const songwriterAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/songwriter-assistant`,
  `${WS_URL}/ws/songwriter-assistant/conversations`
);

// Scriptwriter Assistant - Proxied through PostOffice
export const scriptwriterAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/scriptwriter-assistant`,
  `${WS_URL}/ws/scriptwriter-assistant/conversations`
);

// Project Manager Assistant - Proxied through PostOffice
export const projectManagerAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/pm-assistant`,
  `${WS_URL}/ws/pm-assistant/conversations`
);

// Investment Advisor Assistant - Proxied through PostOffice
export const investmentAdvisorAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/investment-advisor`,
  `${WS_URL}/ws/investment-advisor/conversations`
);

// Sports Wager Advisor Assistant - Proxied through PostOffice
export const sportsWagerAdvisorAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/sports-wager-advisor`,
  `${WS_URL}/ws/sports-wager-advisor/conversations`
);

// CTO Assistant - Proxied through PostOffice
export const ctoAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/cto-assistant`,
  `${WS_URL}/ws/cto-assistant/conversations`
);

// Content Creator Assistant - Proxied through PostOffice
export const contentCreatorAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/content-creator-assistant`,
  `${WS_URL}/ws/content-creator-assistant/conversations`
);

// Customer Support Assistant - Proxied through PostOffice
import { CustomerSupportAssistantClient } from '../CustomerSupportAgent/CustomerSupportAssistantClient';
export const customerSupportAssistantClient = new CustomerSupportAssistantClient(
  `${API_BASE_URL}/api/customer-support-assistant`,
  `${WS_URL}/ws/customer-support-assistant/conversations`
);

// Performance Analytics Assistant - Proxied through PostOffice
export const performanceAnalyticsAssistantClient = new AssistantClient(
  `${API_BASE_URL}/api/performance-analytics-api`,
  `${WS_URL}/ws/performance-analytics-api/conversations`
);

// Performance Analytics Data API - Used for fetching real data
export const performanceAnalyticsDataClient = {
  baseUrl: `${API_BASE_URL}/api/performance-analytics-api`,
  
  // Get all data for a domain
  async getDomainData(domain: 'executive' | 'hr' | 'marketing' | 'sales') {
    try {
      const response = await fetch(`${this.baseUrl}/performance/${domain}`);
      if (!response.ok) throw new Error(`Failed to fetch ${domain} data`);
      return await response.json();
    } catch (error) {
      console.error(`Error fetching ${domain} data:`, error);
      throw error;
    }
  },

  // Get specific data type for a domain
  async getDomainDataType(
    domain: 'executive' | 'hr' | 'marketing' | 'sales',
    dataType: 'items' | 'metrics' | 'programs'
  ) {
    try {
      const response = await fetch(`${this.baseUrl}/performance/${domain}/${dataType}`);
      if (!response.ok) throw new Error(`Failed to fetch ${domain} ${dataType}`);
      return await response.json();
    } catch (error) {
      console.error(`Error fetching ${domain} ${dataType}:`, error);
      throw error;
    }
  },

  // Store performance data
  async storePerformanceData(
    domain: 'executive' | 'hr' | 'marketing' | 'sales',
    dataType: 'items' | 'metrics' | 'programs',
    data: any[]
  ) {
    try {
      const response = await fetch(`${this.baseUrl}/performance/${domain}/${dataType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error(`Failed to store ${domain} ${dataType}`);
      return await response.json();
    } catch (error) {
      console.error(`Error storing ${domain} ${dataType}:`, error);
      throw error;
    }
  }
};
