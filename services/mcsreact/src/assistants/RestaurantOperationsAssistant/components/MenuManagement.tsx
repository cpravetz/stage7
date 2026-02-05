import React from 'react';
import { Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TextField } from '@mui/material/index.js';

interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  available: boolean;
  ingredients: string;
}

interface MenuManagementProps {
  menuItems: MenuItem[];
  sendMessage: (message: string) => Promise<void>;
  onUpdateMenuItem?: (id: string, updates: Partial<MenuItem>) => Promise<void>;
  onAddMenuItem?: (menuItem: MenuItem) => Promise<void>;
}

const MenuManagement: React.FC<MenuManagementProps> = ({
  menuItems,
  sendMessage
}) => {
  const [newMenuItem, setNewMenuItem] = React.useState<{
    name: string;
    category: string;
    price: number;
    description: string;
    ingredients: string;
  }>({
    name: '',
    category: 'Appetizer',
    price: 0,
    description: '',
    ingredients: ''
  });

  const handleAdd = () => {
    if (newMenuItem.name && newMenuItem.price > 0) {
      sendMessage(`Add new menu item: ${JSON.stringify({
        name: newMenuItem.name,
        category: newMenuItem.category,
        price: newMenuItem.price,
        description: newMenuItem.description,
        ingredients: newMenuItem.ingredients,
        available: true
      })}`);
      setNewMenuItem({
        name: '',
        category: 'Appetizer',
        price: 0,
        description: '',
        ingredients: ''
      });
    }
  };

  const categories = ['Appetizer', 'Main Course', 'Dessert', 'Beverage', 'Special'];

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Menu Management
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Add New Menu Item
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Item Name"
            value={newMenuItem.name}
            onChange={(e) => setNewMenuItem({...newMenuItem, name: e.target.value})}
            sx={{ flex: 1, minWidth: 200 }}
          />
          <TextField
            select
            label="Category"
            value={newMenuItem.category}
            onChange={(e) => setNewMenuItem({...newMenuItem, category: e.target.value})}
            SelectProps={{ native: true }}
            sx={{ width: 150 }}
          >
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </TextField>
          <TextField
            label="Price"
            type="number"
            value={newMenuItem.price}
            onChange={(e) => setNewMenuItem({...newMenuItem, price: parseFloat(e.target.value) || 0})}
            sx={{ width: 120 }}
            InputProps={{ startAdornment: '$' }}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleAdd}
            disabled={!newMenuItem.name || newMenuItem.price <= 0}
          >
            Add Menu Item
          </Button>
        </Box>
        <TextField
          label="Description"
          value={newMenuItem.description}
          onChange={(e) => setNewMenuItem({...newMenuItem, description: e.target.value})}
          fullWidth
          multiline
          rows={2}
          sx={{ mb: 2 }}
        />
        <TextField
          label="Ingredients (comma separated)"
          value={newMenuItem.ingredients}
          onChange={(e) => setNewMenuItem({...newMenuItem, ingredients: e.target.value})}
          fullWidth
          multiline
          rows={2}
        />
      </Paper>

      <Typography variant="subtitle1" gutterBottom>
        Current Menu
      </Typography>

      {categories.map((category) => (
        <Box key={category} sx={{ mb: 4 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
            {category}
          </Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Item</TableCell>
                  <TableCell>Price</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Available</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {menuItems.filter(item => item.category === category).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>${item.price.toFixed(2)}</TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{item.available ? 'Yes' : 'No'}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => sendMessage(`Update menu item ${item.name} (ID: ${item.id}) set available to ${!item.available}`)}
                        >
                          {item.available ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => sendMessage(`Update menu item ${item.name} (ID: ${item.id}) to increase price by 10%`)}
                        >
                          Increase Price
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      ))}

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button variant="outlined" onClick={() => sendMessage(`Enable all menu items`)}>
          Enable All Items
        </Button>
        <Button variant="outlined" onClick={() => sendMessage(`Reset all menu item prices to 0`)}>
          Reset Prices
        </Button>
      </Box>
    </Box>
  );
};

export default MenuManagement;

