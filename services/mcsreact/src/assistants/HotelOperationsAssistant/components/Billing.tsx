import React from 'react';
import { Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TextField } from '@mui/material';

interface BillingProps {
  invoices: Array<{
    id: string;
    guestName: string;
    roomNumber: string;
    amount: number;
    status: string;
    dueDate: string;
    items: Array<{
      description: string;
      amount: number;
    }>;
  }>;
  onCreateInvoice: (guestId: string, amount: number) => void;
  onProcessPayment: (invoiceId: string, paymentMethod: string) => void;
}

const Billing: React.FC<BillingProps> = ({
  invoices,
  onCreateInvoice,
  onProcessPayment
}) => {
  const [newInvoice, setNewInvoice] = React.useState<{
    guestId: string;
    amount: number;
  }>({
    guestId: '',
    amount: 0
  });

  const handleCreate = () => {
    if (newInvoice.guestId && newInvoice.amount > 0) {
      onCreateInvoice(newInvoice.guestId, newInvoice.amount);
      setNewInvoice({ guestId: '', amount: 0 });
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Billing Management
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Create New Invoice
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label="Guest ID"
            value={newInvoice.guestId}
            onChange={(e) => setNewInvoice({...newInvoice, guestId: e.target.value})}
            sx={{ width: 200 }}
          />
          <TextField
            label="Amount"
            type="number"
            value={newInvoice.amount}
            onChange={(e) => setNewInvoice({...newInvoice, amount: parseFloat(e.target.value) || 0})}
            sx={{ width: 150 }}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleCreate}
            disabled={!newInvoice.guestId || newInvoice.amount <= 0}
          >
            Create Invoice
          </Button>
        </Box>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Invoice ID</TableCell>
              <TableCell>Guest Name</TableCell>
              <TableCell>Room</TableCell>
              <TableCell>Amount</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Due Date</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>{invoice.id}</TableCell>
                <TableCell>{invoice.guestName}</TableCell>
                <TableCell>{invoice.roomNumber}</TableCell>
                <TableCell>${invoice.amount.toFixed(2)}</TableCell>
                <TableCell>{invoice.status}</TableCell>
                <TableCell>{new Date(invoice.dueDate).toLocaleDateString()}</TableCell>
                <TableCell>
                  {invoice.status === 'Pending' && (
                    <>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => onProcessPayment(invoice.id, 'Credit Card')}
                        sx={{ mr: 1 }}
                      >
                        Process Payment
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => onProcessPayment(invoice.id, 'Cash')}
                      >
                        Mark Paid
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Billing Summary
        </Typography>
        <Paper sx={{ p: 2 }}>
          <Typography>Total Pending: ${invoices.filter(i => i.status === 'Pending').reduce((sum, i) => sum + i.amount, 0).toFixed(2)}</Typography>
          <Typography>Total Paid: ${invoices.filter(i => i.status === 'Paid').reduce((sum, i) => sum + i.amount, 0).toFixed(2)}</Typography>
          <Typography>Total Overdue: ${invoices.filter(i => i.status === 'Pending' && new Date(i.dueDate) < new Date()).reduce((sum, i) => sum + i.amount, 0).toFixed(2)}</Typography>
        </Paper>
      </Box>
    </Box>
  );
};

export default Billing;

