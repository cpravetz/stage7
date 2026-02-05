import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { hotelOperationsAssistantClient } from '../shared/assistantClients';
import { Tabs, Tab, Box, Typography, useTheme, useMediaQuery } from '@mui/material/index.js';
import { ConversationMessage } from '@cktmcs/sdk';

import RoomManagement from './components/RoomManagement';
import GuestServices from './components/GuestServices';
import Housekeeping from './components/Housekeeping';
import Reservations from './components/Reservations';
import Billing from './components/Billing';
import Maintenance from './components/Maintenance';
import Concierge from './components/Concierge';
import Analytics from './components/Analytics';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';
import { HotelOperationsAssistantMessageBuilder } from '../../utils/AssistantMessageBuilders';

// Define types
interface Room {
  id: string;
  roomNumber: string;
  status: 'available' | 'occupied' | 'dirty' | 'maintenance';
  type: 'single' | 'double' | 'suite';
  guestId?: string;
}

interface Guest {
  id: string;
  name: string;
  roomNumber: string;
  checkInDate: string;
  checkOutDate: string;
}

interface GuestRequest {
  id: string;
  guestId: string;
  guestName: string;
  request: string;
  status: 'pending' | 'in-progress' | 'resolved';
  roomNumber: string;
  timestamp: string;
}

interface HousekeepingTask {
  id: string;
  roomNumber: string;
  scheduledTime: string;
  taskType: string;
  status: 'pending' | 'in-progress' | 'completed';
  assignedTo: string;
  timeEstimate?: string;
}

interface HotelReservation {
  id: string;
  guestName: string;
  roomType: string;
  checkInDate: string;
  checkOutDate: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  totalPrice: number;
}

interface Invoice {
  id: string;
  guestId: string;
  guestName: string;
  roomNumber: string;
  amount: number;
  status: 'pending' | 'paid';
  dueDate: string;
  items: Array<{
    description: string;
    amount: number;
  }>;
}

interface MaintenanceRequest {
  id: string;
  roomNumber: string;
  issueDescription: string;
  priority: string;
  status: 'pending' | 'in-progress' | 'completed';
  assignedTo: string;
  reportedDate: string;
}

interface ConciergeRequest {
  id: string;
  guestName: string;
  roomNumber: string;
  requestType: string;
  requestDetails: string;
  status: 'pending' | 'fulfilled';
  notes: string;
}

interface OperationalAnalyticsData {
  occupancyRate: number;
  revenue: number;
  averageDailyRate: number;
  guestSatisfaction: number;
  roomOccupancyByType: Array<{ type: string; count: number; total: number }>;
  revenueByService: Array<{ service: string; amount: number }>;
  dailyOccupancy: Array<{ date: string; occupancy: number }>;
}

interface AssistantRenderProps {
    messages: ConversationMessage[];
    sendMessage: (message: string) => Promise<void>;
    sendEvent: (event: any) => Promise<void>;
    assistantState?: Record<string, any>;
    getState: (collectionName: string) => any[];
    mergeAssistantState?: (collection: string, items: any[]) => void;
    conversationId?: string;
    isLoading: boolean;
    error: string | null;
    humanInputRequired: { prompt: string; type: string; metadata: any; inputStepId: string; } | null;
    submitHumanInput: (response: string, inputStepId: string) => void;
    clientId: string;
}

const HotelOperationsAssistantView: React.FC<AssistantRenderProps> = ({ 
    messages, 
    sendMessage, 
    sendEvent, 
    assistantState = {}, 
    getState = () => [], 
    mergeAssistantState = () => {}, 
    conversationId, 
    isLoading, 
    error, 
    humanInputRequired, 
    submitHumanInput, 
    clientId 
}) => {
    const [tabValue, setTabValue] = useState(0);

    const buildEvent = useCallback((eventType: string, payload: any, entityId?: string) => ({
        type: eventType,
        payload: { ...payload, conversationId },
        entityId: entityId || payload.id || `${eventType}-${Date.now()}`
    }), [conversationId]);

    useEffect(() => {
        if (conversationId) {
            const collections = ['room', 'guest', 'guestRequest', 'housekeepingTask', 'hotelReservation', 'invoice', 'maintenanceRequest', 'conciergeRequest'];
            collections.forEach(collection => {
                sendEvent(buildEvent(`domain.${collection}.load`, { conversationId }));
            });
        }
    }, [conversationId, getState, sendEvent, buildEvent]);

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    const rooms = useMemo(() => 
        getState('room') || assistantState.room || [],
        [assistantState, getState]
    );

    const guests = useMemo(() => 
        getState('guest') || assistantState.guest || [],
        [assistantState, getState]
    );

    const guestRequests = useMemo(() => 
        getState('guestRequest') || assistantState.guestRequest || [],
        [assistantState, getState]
    );

    const housekeepingTasks = useMemo(() => 
        getState('housekeepingTask') || assistantState.housekeepingTask || [],
        [assistantState, getState]
    );

    const reservations = useMemo(() => 
        getState('hotelReservation') || assistantState.hotelReservation || [],
        [assistantState, getState]
    );

    const invoices = useMemo(() => 
        getState('invoice') || assistantState.invoice || [],
        [assistantState, getState]
    );

    const maintenanceRequests = useMemo(() => 
        getState('maintenanceRequest') || assistantState.maintenanceRequest || [],
        [assistantState, getState]
    );

    const conciergeRequests = useMemo(() => 
        getState('conciergeRequest') || assistantState.conciergeRequest || [],
        [assistantState, getState]
    );

    const currentAnalyticsData = useMemo(() => 
        assistantState.analyticsData || null,
        [assistantState]
    );

    return (
        <Box sx={{ display: 'flex', height: '100%', width: '100%' }}>
                        <Box sx={{ flexGrow: 1, overflowY: 'auto', width: '50%' }}>
                <Box component="div" sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs
                        value={tabValue}
                        onChange={handleTabChange}
                        indicatorColor="primary"
                        textColor="primary"
                        variant="scrollable"
                        scrollButtons="auto"
                        aria-label="hotel operations assistant features tabs"
                    >
                        <Tab label="Room Management" />
                        <Tab label="Guest Services" />
                        <Tab label="Housekeeping" />
                        <Tab label="Reservations" />
                        <Tab label="Billing" />
                        <Tab label="Maintenance" />
                        <Tab label="Concierge" />
                        <Tab label="Analytics" />
                    </Tabs>
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 0}>
                    {tabValue === 0 && (
                        <Box sx={{ p: 3 }}>
                            <RoomManagement
                                rooms={rooms}
                                guests={guests}
                                onAssignRoom={(guestId, roomNumber) => {
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                    const msg = HotelOperationsAssistantMessageBuilder.assignRoom(missionId, clientId, clientId, { guestId, roomNumber });
                                    sendMessage(JSON.stringify(msg));
                                }}
                                onCheckIn={(guestId) => {
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                    const msg = HotelOperationsAssistantMessageBuilder.manageStaff(missionId, clientId, clientId, { staffId: guestId, action: 'assign' });
                                    sendMessage(JSON.stringify(msg));
                                }}
                                onCheckOut={(guestId) => {
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                    const msg = HotelOperationsAssistantMessageBuilder.manageStaff(missionId, clientId, clientId, { staffId: guestId, action: 'reassign' });
                                    sendMessage(JSON.stringify(msg));
                                }}
                                onUpdateRoomStatus={(roomNumber, status) => {
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                    const msg = HotelOperationsAssistantMessageBuilder.monitorOperations(missionId, clientId, clientId, { metricsType: 'occupancy' });
                                    sendMessage(JSON.stringify(msg));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 1}>
                    {tabValue === 1 && (
                      <Box sx={{ p: 3 }}>
                        <GuestServices
                          guestRequests={guestRequests}
                          onCreateRequest={(request) => {
                                                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                                        const msg = HotelOperationsAssistantMessageBuilder.createGuestRequest(missionId, clientId, clientId, { guestId: request.guestId, description: request.request });
                            sendMessage(JSON.stringify(msg));
                          }}
                          onResolveRequest={(requestId) => {
                                                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                                        const msg = HotelOperationsAssistantMessageBuilder.manageReservations(missionId, clientId, clientId, { action: 'check-in', reservationData: { requestId } });
                            sendMessage(JSON.stringify(msg));
                          }}
                          onSendMessage={(guestId, message) => {
                                                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                                        const msg = HotelOperationsAssistantMessageBuilder.createGuestRequest(missionId, clientId, clientId, { guestId, description: message });
                            sendMessage(JSON.stringify(msg));
                          }}
                        />
                      </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 2}>
                    {tabValue === 2 && (
                        <Box sx={{ p: 3 }}>
                            <Housekeeping
                                housekeepingTasks={housekeepingTasks}
                                onScheduleHousekeeping={(roomNumber, time) => {
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                    const msg = HotelOperationsAssistantMessageBuilder.manageStaff(missionId, clientId, clientId, { action: 'schedule', staffData: { roomNumber, time } });
                                    sendMessage(JSON.stringify(msg));
                                }}
                                onUpdateStatus={(taskId, status) => {
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                    const msg = HotelOperationsAssistantMessageBuilder.monitorOperations(missionId, clientId, clientId, { metricsType: 'performance' });
                                    sendMessage(JSON.stringify(msg));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 3}>
                    {tabValue === 3 && (
                        <Box sx={{ p: 3 }}>
                            <Reservations
                                reservations={reservations}
                                onCreateReservation={(reservation) => {
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                    const msg = HotelOperationsAssistantMessageBuilder.manageReservations(missionId, clientId, clientId, { action: 'create', reservationData: reservation });
                                    sendMessage(JSON.stringify(msg));
                                }}
                                onUpdateReservation={(reservationId, updates) => {
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                    const msg = HotelOperationsAssistantMessageBuilder.manageReservations(missionId, clientId, clientId, { action: 'update', reservationId, reservationData: updates });
                                    sendMessage(JSON.stringify(msg));
                                }}
                                onCancelReservation={(reservationId) => {
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                    const msg = HotelOperationsAssistantMessageBuilder.manageReservations(missionId, clientId, clientId, { action: 'cancel', reservationId });
                                    sendMessage(JSON.stringify(msg));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 4}>
                    {tabValue === 4 && (
                        <Box sx={{ p: 3 }}>
                            <Billing
                                invoices={invoices}
                                onCreateInvoice={(guestId, amount) => {
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                    const msg = HotelOperationsAssistantMessageBuilder.monitorOperations(missionId, clientId, clientId, { metricsType: 'revenue', analyzeData: true });
                                    sendMessage(JSON.stringify(msg));
                                }}
                                onProcessPayment={(invoiceId, paymentMethod) => {
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                    const msg = HotelOperationsAssistantMessageBuilder.manageReservations(missionId, clientId, clientId, { action: 'update', reservationId: invoiceId });
                                    sendMessage(JSON.stringify(msg));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 5}>
                    {tabValue === 5 && (
                        <Box sx={{ p: 3 }}>
                            <Maintenance
                                maintenanceRequests={maintenanceRequests}
                                onCreateRequest={(request) => {
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                    const msg = HotelOperationsAssistantMessageBuilder.createGuestRequest(missionId, clientId, clientId, { description: request.issueDescription });
                                    sendMessage(JSON.stringify(msg));
                                }}
                                onUpdateStatus={(requestId, status) => {
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                    const msg = HotelOperationsAssistantMessageBuilder.monitorOperations(missionId, clientId, clientId, { metricsType: 'performance' });
                                    sendMessage(JSON.stringify(msg));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 6}>
                    {tabValue === 6 && (
                        <Box sx={{ p: 3 }}>
                            <Concierge
                                conciergeRequests={conciergeRequests}
                                onAddRequest={(request) => {
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                    const msg = HotelOperationsAssistantMessageBuilder.createGuestRequest(missionId, clientId, clientId, { guestId: request.id, description: request.requestDetails });
                                    sendMessage(JSON.stringify(msg));
                                }}
                                onFulfillRequest={(requestId) => {
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                    const msg = HotelOperationsAssistantMessageBuilder.monitorOperations(missionId, clientId, clientId, { metricsType: 'guest-satisfaction' });
                                    sendMessage(JSON.stringify(msg));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 7}>
                    {tabValue === 7 && (
                        <Box sx={{ p: 3 }}>
                            <Analytics analyticsData={currentAnalyticsData} />
                        </Box>
                    )}
                </Box>
            </Box>

            <Box sx={{ width: '50%', borderLeft: '1px solid #e0e0e0' }}>
                <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Hotel Operations Assistant" enableVoiceInput={true} />
            </Box>
        </Box>
    );
};


const HotelOperationsAssistant: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="Hotel Operations Assistant"
      description="Your AI-powered hotel operations assistant for guest management, room assignments, housekeeping coordination, reservations, billing, maintenance, and operational analytics."
      client={hotelOperationsAssistantClient}
      initialPrompt="Hello! I need help with hotel operations management."
      clientId={clientId}
    >
      {(props) => <HotelOperationsAssistantView {...props} />}
    </BaseAssistantPage>
  );
};

export default HotelOperationsAssistant;



