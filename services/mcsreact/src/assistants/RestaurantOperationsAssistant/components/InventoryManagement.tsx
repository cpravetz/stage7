import React from 'react';
import { Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TextField } from '@mui/material/index.js';

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  currentQuantity: number;
  minQuantity: number;
  unit: string;
  lastRestocked: string;
}

interface InventoryManagementProps {
  inventory: InventoryItem[];
  sendMessage: (message: string) => Promise<void>;
  onUpdateInventory?: (itemId: string, quantity: number) => Promise<void>;
  onCreatePurchaseOrder?: (order: any) => Promise<void>;
}

const InventoryManagement: React.FC<InventoryManagementProps> = ({
  inventory,
  sendMessage
}) => {
  const [newOrder, setNewOrder] = React.useState<{
    itemId: string;
    quantity: number;
  }>({
    itemId: '',
    quantity: 0
  });

  // Local state for quantity edits - only sends message when Update button is clicked
  const [quantityEdits, setQuantityEdits] = React.useState<Record<string, number>>({});

  const handleQuantityChange = (itemId: string, value: number) => {
    setQuantityEdits(prev => ({ ...prev, [itemId]: value }));
  };

  const handleUpdateQuantity = (item: InventoryItem) => {
    const newQuantity = quantityEdits[item.id];
    if (newQuantity !== undefined && newQuantity !== item.currentQuantity) {
      sendMessage(`Update inventory for item ${item.name} (ID: ${item.id}) to quantity ${newQuantity}`);
      // Clear the edit state for this item
      setQuantityEdits(prev => {
        const updated = { ...prev };
        delete updated[item.id];
        return updated;
      });
    }
  };

  const handleCreateOrder = () => {
    if (newOrder.itemId && newOrder.quantity > 0) {
      const item = inventory.find(i => i.id === newOrder.itemId);
      sendMessage(`Create purchase order for ${newOrder.quantity} of ${item?.name} (ID: ${newOrder.itemId})`);
      setNewOrder({ itemId: '', quantity: 0 });
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Inventory Management
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Create Purchase Order
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            select
            label="Select Item"
            value={newOrder.itemId}
            onChange={(e) => setNewOrder({...newOrder, itemId: e.target.value})}
            SelectProps={{ native: true }}
            sx={{ minWidth: 200 }}
          >
            <option value="">Select an item</option>
            {inventory.filter(item => item.currentQuantity <= item.minQuantity).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} (Low Stock: {item.currentQuantity} {item.unit})
              </option>
            ))}
          </TextField>
          <TextField
            label="Quantity"
            type="number"
            value={newOrder.quantity}
            onChange={(e) => setNewOrder({...newOrder, quantity: parseInt(e.target.value) || 0})}
            sx={{ width: 150 }}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleCreateOrder}
            disabled={!newOrder.itemId || newOrder.quantity <= 0}
          >
            Create Purchase Order
          </Button>
        </Box>
      </Paper>

      <Typography variant="subtitle1" gutterBottom>
        Inventory Status
      </Typography>

      <TableContainer component={Paper} sx={{ mb: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Item</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Current Quantity</TableCell>
              <TableCell>Minimum Quantity</TableCell>
              <TableCell>Unit</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {inventory.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.category}</TableCell>
                <TableCell>{item.currentQuantity} {item.unit}</TableCell>
                <TableCell>{item.minQuantity} {item.unit}</TableCell>
                <TableCell>{item.unit}</TableCell>
                <TableCell>
                  {item.currentQuantity <= item.minQuantity ? 'Low Stock' : 'In Stock'}
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <TextField
                      type="number"
                      size="small"
                      value={quantityEdits[item.id] !== undefined ? quantityEdits[item.id] : item.currentQuantity}
                      onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value) || 0)}
                      sx={{ width: 80 }}
                    />
                    <Button
                      size="small"
                      variant="contained"
                      disabled={quantityEdits[item.id] === undefined || quantityEdits[item.id] === item.currentQuantity}
                      onClick={() => handleUpdateQuantity(item)}
                    >
                      Update
                    </Button>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button variant="outlined" onClick={() => sendMessage(`Generate automatic purchase order for all low stock items`)}>
          Generate Auto Order
        </Button>
        <Button variant="outlined" onClick={() => sendMessage(`Reset all inventory quantities to zero`)}>
          Reset Inventory
        </Button>
      </Box>

      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Inventory Summary
        </Typography>
        <Paper sx={{ p: 2 }}>
          <Typography>Total Items: {inventory.length}</Typography>
          <Typography>Low Stock Items: {inventory.filter(i => i.currentQuantity <= i.minQuantity).length}</Typography>
          <Typography>Out of Stock Items: {inventory.filter(i => i.currentQuantity <= 0).length}</Typography>
        </Paper>
      </Box>
    </Box>
  );
};

export default InventoryManagement;

