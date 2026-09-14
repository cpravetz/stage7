import { Tool } from '../../../types';
import { createExternalActionSkill } from '../code-skill-factory';

const HOTEL_SKILLS: Tool[] = [
  {
    id: 'manage-reservation',
    name: 'Manage Reservation',
    description: 'Manage a hotel reservation (create, update, cancel). Saves locally; can sync to PMS when configured.',
    type: 'code',
    manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const action = input.action || 'create';
const guestName = input.guestName || '';
const checkIn = input.checkIn || '';
const checkOut = input.checkOut || '';
const roomType = input.roomType || '';
const baseDir = process.env.HOTEL_HOME || path.join('/tmp/hotel');
const storePath = path.join(baseDir, 'reservations.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
const roomNumbers = { standard: '100-199', deluxe: '200-299', suite: '300-399', executive: '400-499', presidential: '500-505' };
const baseRate = { standard: 150, deluxe: 250, suite: 450, executive: 650, presidential: 1200 };
const rate = baseRate[roomType.toLowerCase()] || 200;
const nights = checkIn && checkOut ? Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24)) : 1;
const total = rate * nights;
const statusMap = { create: 'confirmed', update: 'modified', cancel: 'cancelled' };
const status = statusMap[action] || 'pending';
const roomNumber = Math.floor(Math.random() * 100) + (parseInt(roomNumbers[roomType.toLowerCase()?.split('-')[0]) || 100);

const reservation = {
  id: 'res_' + Date.now(),
  action,
  guestName,
  checkIn,
  checkOut,
  roomType,
  roomNumber: roomNumber.toString(),
  rate: rate,
  nights: nights,
  total: total,
  status: status,
  createdAt: new Date().toISOString(),
  source: 'local'
};
store.push(reservation);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
console.log(JSON.stringify({ success: true, data: { reservation, storePath, hint: 'Set HOTEL_PMS_BASE_URL + HOTEL_PMS_API_KEY to sync to PMS' } }));
` },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['create', 'update', 'cancel'], description: 'The action to perform on the reservation' }, guestName: { type: 'string', description: 'Name of the guest' }, checkIn: { type: 'string', description: 'Check-in date (YYYY-MM-DD)' }, checkOut: { type: 'string', description: 'Check-out date (YYYY-MM-DD)' }, roomType: { type: 'string', description: 'Type of room (e.g., standard, deluxe, suite)' } } },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean', description: 'Whether the reservation operation succeeded' }, reservation: { type: 'object', description: 'The reservation object with id, action, guestName, checkIn, checkOut, roomType, createdAt, and source' }, storePath: { type: 'string', description: 'File path where the reservation was stored' } } },
    createdAt: new Date(), updatedAt: new Date(),
  },
];

const EXTERNAL_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    mode: { type: 'string', enum: ['dry-run', 'live', 'error'] },
    system: { type: 'string' },
    action: { type: 'string' },
    request: {
      type: 'object',
      properties: {
        input: { type: 'object' },
        endpoint: { type: 'string' },
        method: { type: 'string' },
        headers: { type: 'object' },
      },
    },
    response: {
      type: ['object', 'null'],
      properties: {
        status: { type: 'number' },
        data: { type: ['object', 'string', 'null'] },
      },
    },
    error: { type: ['string', 'null'] },
  },
  required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
};

const HOTEL_ENDPOINT = 'HOTEL_PMS_ENDPOINT';
const HOTEL_TOKEN = 'HOTEL_PMS_ACCESS_TOKEN';

const createHotelSkill = (opts: {
  id: string
  name: string
  description: string
  action: string
  inputSchema: Record<string, unknown>
  configProperties: Record<string, unknown>
  requiredConfig: string[]
  timeoutMs?: number
}) =>
  createExternalActionSkill({
    id: opts.id,
    name: opts.name,
    description: opts.description,
    system: 'hotel',
    action: opts.action,
    endpoint: { envVar: HOTEL_ENDPOINT, method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { token: HOTEL_TOKEN },
    },
    credentialSource: {
      token: { envVar: HOTEL_TOKEN, configKey: `hotel.${opts.action}.token` },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Hotel PMS base URL' },
        token: { type: 'string', description: 'Hotel PMS bearer token' },
        provider: { type: 'string', enum: ['opera', 'fidelio', 'protel', 'cloudbeds', 'mews', 'custom'] },
        ...opts.configProperties,
      },
      required: ['baseUrl', 'token', ...opts.requiredConfig],
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', description: 'The operation to perform' },
        propertyId: { type: 'string', description: 'Property identifier' },
        roomId: { type: 'string', description: 'Room identifier' },
        guestId: { type: 'string', description: 'Guest identifier' },
        reservationId: { type: 'string', description: 'Reservation identifier' },
        staffId: { type: 'string', description: 'Staff identifier' },
        taskId: { type: 'string', description: 'Task identifier' },
        issueId: { type: 'string', description: 'Issue identifier' },
        checkIn: { type: 'string', description: 'Check-in date (YYYY-MM-DD)' },
        checkOut: { type: 'string', description: 'Check-out date (YYYY-MM-DD)' },
        dateRange: { type: 'object', properties: { start: { type: 'string', description: 'Start date (YYYY-MM-DD)' }, end: { type: 'string', description: 'End date (YYYY-MM-DD)' } }, description: 'Date range filter' },
        filters: { type: 'object', description: 'Filters to apply to the query' },
        data: { type: 'object', description: 'Data payload for the operation' },
        dryRun: { type: 'boolean', description: 'Whether to run in dry-run mode without executing' },
        ...((opts.inputSchema.properties as Record<string, unknown>) || {}),
      },
      required: ['operation', ...((opts.inputSchema.required as string[]) || [])],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: opts.timeoutMs ?? 60000,
  });

const HOTEL_EXTERNAL_SKILLS: Tool[] = [
  createHotelSkill({
    id: 'hotel-room-assignment',
    name: 'Hotel Room Assignment',
    description: 'Assign rooms to reservations based on availability, guest preferences, and room type.',
    action: 'room-assignment',
    inputSchema: {
      properties: {
        roomType: { type: 'string', description: 'Type of room to assign (e.g., standard, deluxe, suite)' },
        floor: { type: 'number', description: 'Floor number for the room' },
        view: { type: 'string', description: 'Room view preference (e.g., ocean, garden, city)' },
        bedType: { type: 'string', description: 'Bed type preference (e.g., single, double, king)' },
        priority: { type: 'string', enum: ['standard', 'high', 'vip'], description: 'Assignment priority level' },
      },
      required: ['roomType'],
    },
    configProperties: {
      defaultRoomType: { type: 'string' },
      assignmentStrategy: { type: 'string', enum: ['auto', 'manual', 'optimized'] },
    },
    requiredConfig: ['defaultRoomType'],
    timeoutMs: 60000,
  }),
  createHotelSkill({
    id: 'hotel-guest-profile',
    name: 'Hotel Guest Profile',
    description: 'Manage guest profiles including personal details, preferences, loyalty status, and stay history.',
    action: 'guest-profile',
    inputSchema: {
      properties: {
        operation: { type: 'string', enum: ['create', 'read', 'update', 'search', 'list', 'merge'], description: 'The operation to perform on the guest profile' },
        firstName: { type: 'string', description: "Guest's first name" },
        lastName: { type: 'string', description: "Guest's last name" },
        email: { type: 'string', description: "Guest's email address" },
        phone: { type: 'string', description: "Guest's phone number" },
        loyaltyTier: { type: 'string', enum: ['none', 'silver', 'gold', 'platinum'], description: "Guest's loyalty membership tier" },
        preferences: { type: 'object', description: "Guest's preferences such as room, pillow, and amenity choices" },
      },
      required: ['operation'],
    },
    configProperties: {
      defaultLoyaltyTier: { type: 'string' },
      profileMergeEnabled: { type: 'boolean' },
    },
    requiredConfig: [],
  }),
  createHotelSkill({
    id: 'hotel-billing',
    name: 'Hotel Billing',
    description: 'Generate invoices, process payments, manage folios, and handle billing disputes.',
    action: 'billing',
    inputSchema: {
      properties: {
        operation: { type: 'string', enum: ['invoice', 'payment', 'folio', 'adjustment', 'refund', 'dispute'], description: 'The billing operation to perform' },
        amount: { type: 'number', description: 'Transaction amount' },
        currency: { type: 'string', description: 'Currency code (e.g., USD, EUR, GBP)' },
        paymentMethod: { type: 'string', enum: ['cash', 'credit_card', 'debit_card', 'mobile_wallet', 'bank_transfer', 'account_charge'], description: 'Payment method to use' },
        lineItems: { type: 'array', items: { type: 'object' }, description: 'Line items for the invoice or folio' },
        taxRate: { type: 'number', description: 'Tax rate as a percentage' },
        dueDate: { type: 'string', description: 'Payment due date (YYYY-MM-DD)' },
      },
      required: ['operation'],
    },
    configProperties: {
      defaultCurrency: { type: 'string' },
      taxRate: { type: 'number' },
      paymentGateway: { type: 'string', enum: ['stripe', 'adyen', 'braintree', 'custom'] },
    },
    requiredConfig: ['defaultCurrency'],
    timeoutMs: 90000,
  }),
  createHotelSkill({
    id: 'hotel-revenue',
    name: 'Hotel Revenue',
    description: 'Track revenue metrics, manage rate plans, forecast occupancy, and optimize pricing.',
    action: 'revenue',
    inputSchema: {
      properties: {
        operation: { type: 'string', enum: ['report', 'forecast', 'rate-plan', 'analysis', 'export'], description: 'The revenue operation to perform' },
        reportType: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'ytd', 'forecast'], description: 'Time granularity for the revenue report' },
        rateType: { type: 'string', enum: ['rack', 'corporate', 'group', 'promotional', 'dynamic'], description: 'Rate plan type to analyze' },
        metrics: { type: 'array', items: { type: 'string' }, description: 'List of revenue metrics to include (e.g., revenue, occupancy, ADR)' },
      },
      required: ['operation'],
    },
    configProperties: {
      defaultCurrency: { type: 'string' },
      fiscalYearStart: { type: 'string' },
      reportingTimezone: { type: 'string' },
    },
    requiredConfig: [],
    timeoutMs: 120000,
  }),
  createHotelSkill({
    id: 'hotel-housekeeping-scheduler',
    name: 'Hotel Housekeeping Scheduler',
    description: 'Schedule housekeeping tasks, assign rooms to staff, and track cleaning status.',
    action: 'housekeeping-scheduler',
    inputSchema: {
      properties: {
        operation: { type: 'string', enum: ['schedule', 'assign', 'update', 'list', 'check-status', 'priority'], description: 'The housekeeping operation to perform' },
        roomIds: { type: 'array', items: { type: 'string' }, description: 'List of room identifiers to schedule' },
        staffIds: { type: 'array', items: { type: 'string' }, description: 'List of staff identifiers to assign' },
        priority: { type: 'string', enum: ['standard', 'express', 'deep-clean', 'inspection'], description: 'Cleaning priority level' },
        estimatedMinutes: { type: 'number', description: 'Estimated cleaning duration in minutes' },
        notes: { type: 'string', description: 'Additional notes or special instructions' },
      },
      required: ['operation'],
    },
    configProperties: {
      defaultShiftStart: { type: 'string' },
      roomsPerStaff: { type: 'number' },
    },
    requiredConfig: ['defaultShiftStart'],
  }),
  createHotelSkill({
    id: 'hotel-maintenance',
    name: 'Hotel Maintenance',
    description: 'Manage maintenance requests, track work orders, schedule preventive maintenance, and manage vendors.',
    action: 'maintenance',
    inputSchema: {
      properties: {
        operation: { type: 'string', enum: ['request', 'work-order', 'schedule', 'complete', 'cancel', 'vendor'], description: 'The maintenance operation to perform' },
        category: { type: 'string', enum: ['electrical', 'plumbing', 'hvac', 'structural', 'cosmetic', 'it', 'safety'], description: 'Maintenance category or trade' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'emergency'], description: 'Urgency level of the maintenance request' },
        location: { type: 'string', description: 'Specific location or area within the property' },
        vendorId: { type: 'string', description: 'Vendor identifier for outsourcing' },
        estimatedCost: { type: 'number', description: 'Estimated cost of the maintenance work' },
        attachments: { type: 'array', items: { type: 'object' }, description: 'Attachments such as photos or documents' },
      },
      required: ['operation'],
    },
    configProperties: {
      defaultPriority: { type: 'string' },
      vendorManagementEnabled: { type: 'boolean' },
    },
    requiredConfig: [],
    timeoutMs: 90000,
  }),
  createHotelSkill({
    id: 'hotel-room-status',
    name: 'Hotel Room Status',
    description: 'Track real-time room status including availability, cleaning state, inspection, and out-of-order flags.',
    action: 'room-status',
    inputSchema: {
      properties: {
        operation: { type: 'string', enum: ['update', 'bulk-update', 'search', 'history', 'report'], description: 'The room status operation to perform' },
        status: { type: 'string', enum: ['available', 'occupied', 'out-of-order', 'cleaning', 'inspected', 'reserved', 'maintenance'], description: 'Current or target room status' },
        housekeepingStatus: { type: 'string', enum: ['dirty', 'clean', 'inspected', 'out-of-service'], description: 'Housekeeping cleanliness state' },
        outOfOrderReason: { type: 'string', description: 'Reason the room is out of order' },
        expectedAvailability: { type: 'string', description: 'Expected date the room becomes available (YYYY-MM-DD)' },
      },
      required: ['operation'],
    },
    configProperties: {
      defaultRoomStatus: { type: 'string' },
      autoTransitionEnabled: { type: 'boolean' },
    },
    requiredConfig: [],
  }),
  createHotelSkill({
    id: 'hotel-concierge-knowledge',
    name: 'Hotel Concierge Knowledge',
    description: 'Manage concierge knowledge base, local recommendations, and guest inquiry responses.',
    action: 'concierge-knowledge',
    inputSchema: {
      properties: {
        operation: { type: 'string', enum: ['query', 'recommend', 'category', 'add', 'update', 'remove'], description: 'The concierge knowledge operation to perform' },
        category: { type: 'string', enum: ['dining', 'transport', 'attractions', 'entertainment', 'wellness', 'shopping', 'business'], description: 'Knowledge category' },
        query: { type: 'string', description: 'Natural language query or search term' },
        location: { type: 'object', description: 'Location to center recommendations around' },
        radiusKm: { type: 'number', description: 'Search radius in kilometers' },
        rating: { type: 'number', description: 'Minimum rating threshold' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to filter recommendations' },
      },
      required: ['operation'],
    },
    configProperties: {
      defaultRadiusKm: { type: 'number' },
      minRating: { type: 'number' },
      knowledgeBaseUrl: { type: 'string' },
    },
    requiredConfig: [],
    timeoutMs: 45000,
  }),
  createHotelSkill({
    id: 'hotel-external-booking',
    name: 'Hotel External Booking',
    description: 'Integrate with external booking channels including OTAs, GDS, and direct booking engines.',
    action: 'external-booking',
    inputSchema: {
      properties: {
        operation: { type: 'string', enum: ['sync', 'import', 'export', 'inventory-update', 'rate-sync', 'cancel'], description: 'The external booking operation to perform' },
        channel: { type: 'string', enum: ['booking.com', 'expedia', 'airbnb', 'agoda', 'gds', 'direct', 'custom'], description: 'Booking channel or OTA name' },
        ratePlanId: { type: 'string', description: 'Rate plan identifier' },
        inventoryCount: { type: 'number', description: 'Number of rooms available' },
        stopSell: { type: 'boolean', description: 'Whether to stop selling this room type' },
        dateRange: { type: 'object', properties: { start: { type: 'string', description: 'Start date (YYYY-MM-DD)' }, end: { type: 'string', description: 'End date (YYYY-MM-DD)' } }, description: 'Date range for the operation' },
      },
      required: ['operation'],
    },
    configProperties: {
      channels: { type: 'array', items: { type: 'string' }, description: 'List of configured booking channels' },
      channelManagerUrl: { type: 'string', description: 'Channel manager API URL' },
      syncIntervalMinutes: { type: 'number', description: 'Sync interval in minutes' },
    },
    requiredConfig: ['channels'],
    timeoutMs: 120000,
  }),
  createHotelSkill({
    id: 'hotel-local-information',
    name: 'Hotel Local Information',
    description: 'Provide local area information, weather, transit, emergency contacts, and destination guides.',
    action: 'local-information',
    inputSchema: {
      properties: {
        operation: { type: 'string', enum: ['weather', 'transit', 'attractions', 'events', 'emergency', 'guide'], description: 'The local information type to retrieve' },
        location: { type: 'object', description: 'Location to query (address, coordinates, or place name)' },
        date: { type: 'string', description: 'Date for weather or event information (YYYY-MM-DD)' },
        language: { type: 'string', description: 'Preferred language code (e.g., en, es, fr)' },
        category: { type: 'string', description: 'Specific category of local information' },
        filters: { type: 'object', description: 'Additional filters for the query' },
      },
      required: ['operation'],
    },
    configProperties: {
      defaultLocation: { type: 'object' },
      weatherProvider: { type: 'string', enum: ['openweathermap', 'accuweather', 'custom'] },
      transitProvider: { type: 'string', enum: ['google', 'citymapper', 'custom'] },
    },
    requiredConfig: [],
    timeoutMs: 45000,
  }),
  createHotelSkill({
    id: 'hotel-guest-service',
    name: 'Hotel Guest Service',
    description: 'Handle guest requests, service tickets, special occasions, amenities, and personalized preferences.',
    action: 'guest-service',
    inputSchema: {
      properties: {
        operation: { type: 'string', enum: ['request', 'ticket', 'amenity', 'preference', 'compliment', 'follow-up'], description: 'The guest service operation to perform' },
        requestType: { type: 'string', enum: ['room_service', 'housekeeping', 'maintenance', 'concierge', 'transport', 'special_occasion', 'other'], description: 'Type of guest request' },
        urgency: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Urgency level of the guest request' },
        roomId: { type: 'string', description: 'Room identifier for the guest' },
        guestId: { type: 'string', description: 'Guest identifier' },
        details: { type: 'object', description: 'Detailed description of the request' },
        scheduledTime: { type: 'string', description: 'Scheduled time for the service (ISO 8601)' },
      },
      required: ['operation'],
    },
    configProperties: {
      defaultUrgency: { type: 'string' },
      serviceTicketPrefix: { type: 'string' },
    },
    requiredConfig: [],
    timeoutMs: 60000,
  }),
  createHotelSkill({
    id: 'hotel-task-dispatch',
    name: 'Hotel Task Dispatch',
    description: 'Dispatch operational tasks to staff, track progress, manage shifts, and coordinate team activities.',
    action: 'task-dispatch',
    inputSchema: {
      properties: {
        operation: { type: 'string', enum: ['create', 'assign', 'update', 'complete', 'cancel', 'list', 'route'], description: 'The task dispatch operation to perform' },
        taskType: { type: 'string', enum: ['cleaning', 'maintenance', 'inspection', 'delivery', 'setup', 'turnover'], description: 'Type of task to dispatch' },
        assigneeIds: { type: 'array', items: { type: 'string' }, description: 'List of staff member identifiers to assign' },
        location: { type: 'object', description: 'Location where the task needs to be performed' },
        dueTime: { type: 'string', description: 'Due time for task completion (ISO 8601)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Task priority level' },
        routingStrategy: { type: 'string', enum: ['nearest', 'least-busy', 'specialized', 'round-robin'], description: 'Strategy for assigning tasks to staff' },
      },
      required: ['operation'],
    },
    configProperties: {
      defaultRoutingStrategy: { type: 'string' },
      maxTasksPerStaff: { type: 'number' },
    },
    requiredConfig: ['defaultRoutingStrategy'],
    timeoutMs: 60000,
  }),
  createHotelSkill({
    id: 'hotel-issue-tracker',
    name: 'Hotel Issue Tracker',
    description: 'Track and resolve guest complaints, service issues, maintenance problems, and operational incidents.',
    action: 'issue-tracker',
    inputSchema: {
      properties: {
        operation: { type: 'string', enum: ['create', 'update', 'assign', 'resolve', 'escalate', 'list', 'trends'], description: 'The issue tracking operation to perform' },
        category: { type: 'string', enum: ['service', 'cleanliness', 'maintenance', 'noise', 'safety', 'billing', 'amenities'], description: 'Category of the issue' },
        severity: { type: 'string', enum: ['minor', 'moderate', 'major', 'critical'], description: 'Severity level of the issue' },
        roomId: { type: 'string', description: 'Room identifier related to the issue' },
        guestId: { type: 'string', description: 'Guest identifier who reported the issue' },
        assigneeId: { type: 'string', description: 'Staff identifier assigned to resolve the issue' },
        resolution: { type: 'string', description: 'Resolution description for the issue' },
        compensation: { type: 'object', description: 'Compensation details offered to the guest' },
      },
      required: ['operation'],
    },
    configProperties: {
      autoEscalationEnabled: { type: 'boolean' },
      escalationMinutes: { type: 'number' },
      compensationPolicies: { type: 'array', items: { type: 'object' }, description: 'Compensation policy guidelines' },
    },
    requiredConfig: [],
    timeoutMs: 60000,
  }),
  createHotelSkill({
    id: 'hotel-guest-communication',
    name: 'Hotel Guest Communication',
    description: 'Send personalized communications, notifications, and automated messages to guests.',
    action: 'guest-communication',
    inputSchema: {
      properties: {
        operation: { type: 'string', enum: ['send', 'template', 'schedule', 'history', 'preferences', 'feedback-request'], description: 'The communication operation to perform' },
        channel: { type: 'string', enum: ['email', 'sms', 'push', 'portal', 'phone', 'whatsapp'], description: 'Communication channel to use' },
        templateId: { type: 'string', description: 'Message template identifier' },
        guestId: { type: 'string', description: 'Recipient guest identifier' },
        reservationId: { type: 'string', description: 'Related reservation identifier' },
        subject: { type: 'string', description: 'Message subject line' },
        message: { type: 'string', description: 'Message body content' },
        variables: { type: 'object', description: 'Template variables for personalization' },
        scheduledAt: { type: 'string', description: 'Scheduled send time (ISO 8601)' },
        priority: { type: 'string', enum: ['routine', 'important', 'urgent'], description: 'Message priority level' },
      },
      required: ['operation'],
    },
    configProperties: {
      defaultChannel: { type: 'string', enum: ['email', 'sms', 'portal', 'phone'] },
      communicationProvider: { type: 'string', enum: ['twilio', 'sendgrid', 'aws-ses', 'custom'] },
      optOutPolicy: { type: 'string', description: 'Policy for handling guest opt-out preferences' },
    },
    requiredConfig: ['defaultChannel'],
  }),
  createHotelSkill({
    id: 'hotel-operational-analytics',
    name: 'Hotel Operational Analytics',
    description: 'Generate operational dashboards, KPIs, performance trends, and benchmarking reports.',
    action: 'operational-analytics',
    inputSchema: {
      properties: {
        operation: { type: 'string', enum: ['dashboard', 'report', 'kpi', 'trend', 'benchmark', 'export'], description: 'The analytics operation to perform' },
        metric: { type: 'string', enum: ['occupancy', 'adr', 'revpar', 'guest-satisfaction', 'housekeeping-efficiency', 'revenue', 'cost'], description: 'Metric to analyze' },
        granularity: { type: 'string', enum: ['hourly', 'daily', 'weekly', 'monthly'], description: 'Time granularity for the analysis' },
        dateRange: { type: 'object', properties: { start: { type: 'string', description: 'Start date (YYYY-MM-DD)' }, end: { type: 'string', description: 'End date (YYYY-MM-DD)' } }, description: 'Date range for the analysis' },
        dimensions: { type: 'array', items: { type: 'string' }, description: 'Dimensions to break down the analysis by' },
        format: { type: 'string', enum: ['json', 'csv', 'pdf', 'excel'], description: 'Output format for the report' },
      },
      required: ['operation'],
    },
    configProperties: {
      defaultGranularity: { type: 'string' },
      benchmarkDataSource: { type: 'string', enum: ['internal', 'str', 'smith-travel', 'custom'] },
      dashboardUrl: { type: 'string' },
    },
    requiredConfig: [],
    timeoutMs: 180000,
  }),
  createHotelSkill({
    id: 'hotel-staff-performance',
    name: 'Hotel Staff Performance',
    description: 'Monitor staff performance, track KPIs, manage schedules, and generate performance reviews.',
    action: 'staff-performance',
    inputSchema: {
      properties: {
        operation: { type: 'string', enum: ['review', 'kpi', 'schedule', 'attendance', 'feedback', 'report'], description: 'The staff performance operation to perform' },
        staffId: { type: 'string', description: 'Staff member identifier' },
        department: { type: 'string', enum: ['front-desk', 'housekeeping', 'food-beverage', 'maintenance', 'management', 'security'], description: 'Department to filter or assign' },
        reviewPeriod: { type: 'string', enum: ['weekly', 'monthly', 'quarterly', 'annual'], description: 'Period for the performance review' },
        dateRange: { type: 'object', properties: { start: { type: 'string', description: 'Start date (YYYY-MM-DD)' }, end: { type: 'string', description: 'End date (YYYY-MM-DD)' } }, description: 'Date range for the review period' },
        metrics: { type: 'array', items: { type: 'string' }, description: 'Specific KPIs or metrics to evaluate' },
      },
      required: ['operation'],
    },
    configProperties: {
      defaultReviewPeriod: { type: 'string' },
      kpiTargets: { type: 'object', description: 'Target values for key performance indicators' },
    },
    requiredConfig: [],
    timeoutMs: 90000,
  }),
  createHotelSkill({
    id: 'hotel-inventory-management',
    name: 'Hotel Inventory Management',
    description: 'Manage hotel inventory including linens, amenities, supplies, and F&B stock levels.',
    action: 'inventory-management',
    inputSchema: {
      properties: {
        operation: { type: 'string', enum: ['stock', 'order', 'transfer', 'adjust', 'audit', 'reorder-list'], description: 'The inventory operation to perform' },
        category: { type: 'string', enum: ['linens', 'amenities', 'cleaning', 'food-beverage', 'maintenance', 'office'], description: 'Inventory category' },
        itemId: { type: 'string', description: 'Inventory item identifier' },
        quantity: { type: 'number', description: 'Quantity to adjust or order' },
        unit: { type: 'string', description: 'Unit of measurement (e.g., pieces, cases, liters)' },
        minStockLevel: { type: 'number', description: 'Minimum stock level threshold for reorder alerts' },
        location: { type: 'string', enum: ['housekeeping-closet', 'storage', 'fbm-kitchen', 'laundry', 'front-desk'], description: 'Storage location within the hotel' },
      },
      required: ['operation'],
    },
    configProperties: {
      defaultReorderThreshold: { type: 'number' },
      supplierIds: { type: 'array', items: { type: 'string' }, description: 'List of supplier identifiers' },
      autoReorderEnabled: { type: 'boolean' },
    },
    requiredConfig: ['defaultReorderThreshold'],
  }),
];

export const hotelSkills = [...HOTEL_SKILLS, ...HOTEL_EXTERNAL_SKILLS];
