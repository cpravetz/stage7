import { createQuickAssistant } from '@cktmcs/sdk';

// Start the Event Assistant using the simplified SDK pattern
createQuickAssistant({
  id: 'event-assistant',
  name: 'Event Assistant',
  role: 'Assists with event planning, vendor coordination, and attendee management',
  personality: 'Organized, creative, detail-oriented, and proactive',
  serviceId: 'event-assistant',
  secretEnvVar: 'EVENT_ASSISTANT_API_SECRET',
  tools: async (coreEngineClient) => {
    const {
      VenueFinderTool,
      VendorCoordinatorTool,
      AttendeeTrackerTool,
      BudgetTrackerTool,
      VendorDatabaseTool,
      SeatingTool,
      EventMonitorTool,
      CheckInTool,
      ContractTool,
      PaymentTool,
    } = await import('@cktmcs/sdk');

    return [
      new VenueFinderTool(coreEngineClient),
      new VendorCoordinatorTool(coreEngineClient),
      new AttendeeTrackerTool(coreEngineClient),
      new BudgetTrackerTool(coreEngineClient),
      new VendorDatabaseTool(coreEngineClient),
      new SeatingTool(coreEngineClient),
      new EventMonitorTool(coreEngineClient),
      new CheckInTool(coreEngineClient),
      new ContractTool(coreEngineClient),
      new PaymentTool(coreEngineClient),
    ];
  },
  port: parseInt(process.env.PORT || '3011'),
  urlBase: 'event-assistant-api',
}).catch((error: Error) => {
  console.error('Failed to initialize Event Assistant:', error);
  process.exit(1);
});
