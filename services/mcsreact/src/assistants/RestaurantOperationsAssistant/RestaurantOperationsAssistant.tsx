import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { restaurantOperationsAssistantClient } from '../shared/assistantClients';
import { Tabs, Tab, Box, Typography } from '@mui/material/index.js';
import { ConversationMessage } from '@cktmcs/sdk';
import { RestaurantOperationsAssistantBuilder } from '../../utils/AssistantMessageBuilders';
import {
  Reservation,
  ReservationForTable,
  Shift,
  Order,
  MenuItem,
  ReservationsToolContent,
  TableManagementToolContent,
  StaffSchedulingToolContent,
  KitchenOperationsToolContent,
  InventoryManagementToolContent,
  MenuManagementToolContent,
  FinancialAnalyticsToolContent,
  GuestFeedbackToolContent
} from './types';
import Reservations from './components/Reservations';
import TableManagement from './components/TableManagement';
import StaffScheduling from './components/StaffScheduling';
import KitchenOperations from './components/KitchenOperations';
import InventoryManagement from './components/InventoryManagement';
import MenuManagement from './components/MenuManagement';
import FinancialAnalytics from './components/FinancialAnalytics';
import GuestFeedback from './components/GuestFeedback';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';

// Separate component to hold the state and render logic
const RestaurantOperationsAssistantContent: React.FC<{
  messages: ConversationMessage[];
  sendMessage: (message: string) => Promise<void>;
  sendEvent?: (event: any) => Promise<void>;
  assistantState?: Record<string, any>;
  conversationId?: string;
  isLoading: boolean;
  error: string | null;
  clientId: string;
}> = ({
    messages, sendMessage, sendEvent = async () => {}, assistantState = {}, conversationId, isLoading, error, clientId
  }) => {
    const [tabValue, setTabValue] = useState(0);

    // Helper to build events
    const buildEvent = useCallback((eventType: string, payload: any, entityId?: string) => ({
        type: eventType,
        payload: { ...payload, conversationId },
        entityId: entityId || payload.id || `${eventType}-${Date.now()}`
    }), [conversationId]);

    // Load initial state from Librarian on mount
    useEffect(() => {
      if (conversationId) {
        const collections = ['reservation', 'menuItem', 'staffSchedule', 'inventoryItem', 'guestFeedback', 'tableStatus', 'kitchenOrder'];
        collections.forEach(collection => {
          sendEvent(buildEvent(`domain.${collection}.load`, { conversationId }));
        });
      }
    }, [conversationId, sendEvent, buildEvent]);

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    // Extract state from assistantState
    const reservations = useMemo(() => 
      assistantState?.reservation || [],
      [assistantState]
    );

    const tables = useMemo(() => 
      assistantState?.tableStatus || [],
      [assistantState]
    );

    const reservationsForTableManagement = useMemo(() => reservations.map((r: any) => ({
      id: r.id,
      guestName: r.guestName,
      partySize: r.partySize,
      time: r.time
    })) as ReservationForTable[], [reservations]);

    const staff = useMemo(() => {
      const staffData = assistantState?.staffSchedule || [];
      return staffData.filter((item: any) => item.type === 'staff');
    }, [assistantState]);

    const shifts = useMemo(() => {
      const scheduleData = assistantState?.staffSchedule || [];
      return scheduleData.filter((item: any) => item.type === 'shift');
    }, [assistantState]);

    const orders = useMemo(() => 
      assistantState?.kitchenOrder || [],
      [assistantState]
    );

    const inventory = useMemo(() => 
      assistantState?.inventoryItem || [],
      [assistantState]
    );

    const menuItems = useMemo(() => 
      assistantState?.menuItem || [],
      [assistantState]
    );

    const financialData = useMemo(() => {
      const data = assistantState?.financialData;
      if (data && typeof data === 'object') {
        return data;
      }
      return {
        dailyRevenue: [],
        revenueByCategory: [],
        expenseBreakdown: [],
        profitMargin: 0,
        averageTicketSize: 0,
        tableTurnoverRate: 0,
        laborCostPercentage: 0,
        foodCostPercentage: 0
      };
    }, [assistantState]);

    const feedbackItems = useMemo(() => 
      assistantState?.guestFeedback || [],
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
                        aria-label="restaurant operations assistant features tabs"
                    >
                        <Tab label="Reservations" />
                        <Tab label="Table Management" />
                        <Tab label="Staff Scheduling" />
                        <Tab label="Kitchen Operations" />
                        <Tab label="Inventory" />
                        <Tab label="Menu Management" />
                        <Tab label="Financial Analytics" />
                        <Tab label="Guest Feedback" />
                    </Tabs>
                </Box>

                <Box role="tabpanel" hidden={tabValue !== 0}>
                    {tabValue === 0 && (
                        <Box sx={{ p: 3 }}>
                            <Reservations
                                reservations={reservations}
                                onCreateReservation={async (reservation: Reservation) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = RestaurantOperationsAssistantBuilder.createReservation(missionId, 'unknown-client', missionId, { guestName: reservation.guestName, partySize: reservation.partySize, date: reservation.date, time: reservation.time, specialRequests: reservation.specialRequests, status: reservation.status });
                                  await sendMessage(JSON.stringify(msg));
                                }}
                                onUpdateReservation={async (id: string, updates: Partial<Reservation>) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = RestaurantOperationsAssistantBuilder.updateReservation(missionId, 'unknown-client', missionId, id, updates);
                                  await sendMessage(JSON.stringify(msg));
                                }}
                                onCancelReservation={async (id: string) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = RestaurantOperationsAssistantBuilder.cancelReservation(missionId, 'unknown-client', missionId, id);
                                  await sendMessage(JSON.stringify(msg));
                                }}
                                sendMessage={sendMessage}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 1}>
                    {tabValue === 1 && (
                        <Box sx={{ p: 3 }}>
                            <TableManagement
                                tables={tables}
                                reservations={reservationsForTableManagement}
                                onAssignTable={async (reservationId: string, tableNumber: string) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = RestaurantOperationsAssistantBuilder.assignTable(missionId, 'unknown-client', missionId, { reservationId, tableNumber });
                                  await sendMessage(JSON.stringify(msg));
                                }}
                                onUpdateTableStatus={async (tableNumber: string, status: string) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = RestaurantOperationsAssistantBuilder.updateTableStatus(missionId, 'unknown-client', missionId, { tableNumber, status });
                                  await sendMessage(JSON.stringify(msg));
                                }}
                                sendMessage={sendMessage}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 2}>
                    {tabValue === 2 && (
                        <Box sx={{ p: 3 }}>
                            <StaffScheduling
                                staff={staff}
                                shifts={shifts}
                                onScheduleStaff={async (staffId: string, shift: Shift) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = RestaurantOperationsAssistantBuilder.scheduleStaff(missionId, 'unknown-client', missionId, { staffId, date: shift.date, startTime: shift.startTime, endTime: shift.endTime, role: shift.role });
                                  await sendMessage(JSON.stringify(msg));
                                }}
                                onUpdateAvailability={async (staffId: string, available: boolean) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = RestaurantOperationsAssistantBuilder.updateStaffAvailability(missionId, 'unknown-client', missionId, { staffId, available });
                                  await sendMessage(JSON.stringify(msg));
                                }}
                                sendMessage={sendMessage}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 3}>
                    {tabValue === 3 && (
                        <Box sx={{ p: 3 }}>
                            <KitchenOperations
                                orders={orders}
                                onCreateOrder={async (order: Order) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = RestaurantOperationsAssistantBuilder.createOrder(missionId, 'unknown-client', missionId, { tableNumber: order.tableNumber, items: order.items, priority: order.priority });
                                  await sendMessage(JSON.stringify(msg));
                                }}
                                onUpdateOrderStatus={async (id: string, status: string) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = RestaurantOperationsAssistantBuilder.updateOrderStatus(missionId, 'unknown-client', missionId, { orderId: id, status });
                                  await sendMessage(JSON.stringify(msg));
                                }}
                                sendMessage={sendMessage}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 4}>
                    {tabValue === 4 && (
                        <Box sx={{ p: 3 }}>
                            <InventoryManagement
                                inventory={inventory}
                                onUpdateInventory={async (itemId: string, quantity: number) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = RestaurantOperationsAssistantBuilder.updateInventory(missionId, 'unknown-client', missionId, { itemId, quantity });
                                  await sendMessage(JSON.stringify(msg));
                                }}
                                onCreatePurchaseOrder={async (order: any) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = RestaurantOperationsAssistantBuilder.createPurchaseOrder(missionId, 'unknown-client', missionId, { itemId: order.itemId, quantity: order.quantity, vendor: order.vendor });
                                  await sendMessage(JSON.stringify(msg));
                                }}
                                sendMessage={sendMessage}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 5}>
                    {tabValue === 5 && (
                        <Box sx={{ p: 3 }}>
                            <MenuManagement
                                menuItems={menuItems}
                                onUpdateMenuItem={async (id: string, updates: Partial<MenuItem>) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = RestaurantOperationsAssistantBuilder.updateMenuItem(missionId, 'unknown-client', missionId, { itemId: id, ...updates });
                                  await sendMessage(JSON.stringify(msg));
                                }}
                                onAddMenuItem={async (menuItem: MenuItem) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = RestaurantOperationsAssistantBuilder.addMenuItem(missionId, 'unknown-client', missionId, { name: menuItem.name, category: menuItem.category, price: menuItem.price, description: menuItem.description, ingredients: menuItem.ingredients, available: menuItem.available });
                                  await sendMessage(JSON.stringify(msg));
                                }}
                                sendMessage={sendMessage}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 6}>
                    {tabValue === 6 && (
                        <Box sx={{ p: 3 }}>
                            <FinancialAnalytics
                                financialData={financialData}
                                sendMessage={sendMessage}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 7}>
                    {tabValue === 7 && (
                        <Box sx={{ p: 3 }}>
                            <GuestFeedback
                                feedbackItems={feedbackItems}
                                sendMessage={sendMessage}
                            />
                        </Box>
                    )}
                </Box>
            </Box>

            <Box sx={{ width: '50%', borderLeft: '1px solid #e0e0e0' }}>
                <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Restaurant Operations Assistant" enableVoiceInput={true} />
            </Box>
        </Box>
    );
};

const RestaurantOperationsAssistant: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="Restaurant Operations Assistant"
      description="Your AI-powered restaurant operations assistant for reservations, table management, staff scheduling, kitchen coordination, inventory management, menu engineering, and financial analytics."
      client={restaurantOperationsAssistantClient}
      initialPrompt="Hello! I need help with restaurant operations management."
      clientId={clientId}
    >
      {({ messages, sendMessage, sendEvent, assistantState, isLoading, error, humanInputRequired, submitHumanInput }) => (
        <RestaurantOperationsAssistantContent
          messages={messages}
          sendMessage={sendMessage}
          sendEvent={sendEvent}
          assistantState={assistantState}
          isLoading={isLoading}
          error={error}
          clientId={clientId}
        />
      )}
    </BaseAssistantPage>
  );
};

export default RestaurantOperationsAssistant;



