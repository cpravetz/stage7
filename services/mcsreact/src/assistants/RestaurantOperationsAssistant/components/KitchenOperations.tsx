import React from 'react';
import { Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TextField, Chip } from '@mui/material/index.js';

interface OrderItem {
  name: string;
  quantity: number;
  status: string;
}

interface Order {
  id: string;
  tableNumber: string;
  items: OrderItem[];
  status: string;
  priority: string;
  timestamp: string;
}

interface KitchenOperationsProps {
  orders: Order[];
  sendMessage: (message: string) => Promise<void>;
  onCreateOrder?: (order: Order) => Promise<void>;
  onUpdateOrderStatus?: (id: string, status: string) => Promise<void>;
}

const KitchenOperations: React.FC<KitchenOperationsProps> = ({
  orders,
  sendMessage
}) => {
  const [newOrder, setNewOrder] = React.useState<{
    tableNumber: string;
    items: string;
  }>({
    tableNumber: '',
    items: ''
  });

  const handleCreate = () => {
    if (newOrder.tableNumber && newOrder.items) {
      sendMessage(`Create kitchen order for table ${newOrder.tableNumber} with items: ${newOrder.items}`);
      setNewOrder({ tableNumber: '', items: '' });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Received': return 'info';
      case 'In Progress': return 'warning';
      case 'Ready': return 'success';
      case 'Delivered': return 'secondary';
      default: return 'default';
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Kitchen Operations
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Create New Order
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label="Table Number"
            value={newOrder.tableNumber}
            onChange={(e) => setNewOrder({...newOrder, tableNumber: e.target.value})}
            sx={{ width: 150 }}
          />
          <TextField
            label="Items (comma separated)"
            value={newOrder.items}
            onChange={(e) => setNewOrder({...newOrder, items: e.target.value})}
            fullWidth
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleCreate}
            disabled={!newOrder.tableNumber || !newOrder.items}
          >
            Submit Order
          </Button>
        </Box>
      </Paper>

      <Typography variant="subtitle1" gutterBottom>
        Active Orders
      </Typography>

      {orders.map((order) => (
        <Paper key={order.id} sx={{ p: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle2">
              Order #{order.id} - Table {order.tableNumber}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Chip label={order.status} color={getStatusColor(order.status)} size="small" />
              <Chip label={order.priority} color="warning" size="small" />
              <Typography variant="caption" color="text.secondary">
                {new Date(order.timestamp).toLocaleTimeString()}
              </Typography>
            </Box>
          </Box>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell>Qty</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {order.items.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
            {order.status === 'Received' && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => sendMessage(`Start preparation for order ${order.id}`)}
              >
                Start Preparation
              </Button>
            )}
            {order.status === 'In Progress' && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => sendMessage(`Mark order ${order.id} as Ready`)}
              >
                Mark Ready
              </Button>
            )}
            {order.status === 'Ready' && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => sendMessage(`Mark order ${order.id} as Delivered`)}
              >
                Mark Delivered
              </Button>
            )}
          </Box>
        </Paper>
      ))}

      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Kitchen Summary
        </Typography>
        <Paper sx={{ p: 2 }}>
          <Typography>Pending Orders: {orders.filter(o => o.status === 'Received').length}</Typography>
          <Typography>In Progress: {orders.filter(o => o.status === 'In Progress').length}</Typography>
          <Typography>Ready for Delivery: {orders.filter(o => o.status === 'Ready').length}</Typography>
          <Typography>High Priority: {orders.filter(o => o.priority === 'High').length}</Typography>
        </Paper>
      </Box>
    </Box>
  );
};

export default KitchenOperations;

