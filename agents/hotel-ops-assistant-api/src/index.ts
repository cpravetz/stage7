import { createQuickAssistant } from '@cktmcs/sdk';

// Start the Hotel Operations Assistant using the simplified SDK pattern
createQuickAssistant({
  id: 'hotel-ops-assistant',
  name: 'Hotel Operations Assistant',
  role: 'Assists with hotel operations including guest check-in/check-out, reservation management, housekeeping coordination, concierge services, guest request handling, and operational analytics',
  personality: 'Professional, service-oriented, detail-focused, and guest-centric',
  serviceId: 'hotel-ops-assistant',
  secretEnvVar: 'HOTEL_OPS_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      RoomAssignmentTool,
      HotelGuestProfileTool,
      BillingTool,
      HotelReservationSystemTool,
      RevenueTool,
      ReservationCoordinator,
      HousekeepingScheduler,
      MaintenanceTool,
      RoomStatusTool,
      ConciergeKnowledgeTool,
      ExternalBookingTool,
      LocalInformationTool,
      GuestServiceTool,
      TaskDispatchTool,
      IssueTrackerTool,
      GuestCommunicationTool,
      OperationalAnalyticsTool,
      StaffPerformanceTool,
      InventoryManagementTool,
    } = await import('@cktmcs/sdk');

    return [
      new RoomAssignmentTool(coreEngineClient),
      new HotelGuestProfileTool(coreEngineClient),
      new BillingTool(coreEngineClient),
      new HotelReservationSystemTool(coreEngineClient),
      new RevenueTool(coreEngineClient),
      new ReservationCoordinator(coreEngineClient),
      new HousekeepingScheduler(coreEngineClient),
      new MaintenanceTool(coreEngineClient),
      new RoomStatusTool(coreEngineClient),
      new ConciergeKnowledgeTool(coreEngineClient),
      new ExternalBookingTool(coreEngineClient),
      new LocalInformationTool(coreEngineClient),
      new GuestServiceTool(coreEngineClient),
      new TaskDispatchTool(coreEngineClient),
      new IssueTrackerTool(coreEngineClient),
      new GuestCommunicationTool(coreEngineClient),
      new OperationalAnalyticsTool(coreEngineClient),
      new StaffPerformanceTool(coreEngineClient),
      new InventoryManagementTool(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3018'), // Changed from 3017 to avoid conflict with restaurant-ops
  urlBase: 'hotel-ops-assistant-api',
}).catch((error: Error) => {
  console.error('Failed to initialize Hotel Operations Assistant:', error);
  process.exit(1);
});
