import React from 'react';
import { Box, Typography, Paper, Button, List, ListItem, ListItemText, ListItemSecondaryAction, Chip, TextField, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material/index.js';
import { ApprovalRequest } from './types';

interface HumanInTheLoopApprovalsProps {
  approvalRequests: ApprovalRequest[];
  onApproveRequest: (id: string) => void;
  onRejectRequest: (id: string, reason: string) => void;
  onRequestChanges: (id: string, changes: string) => void;
  sendMessage: (message: string) => Promise<any>;
}

const HumanInTheLoopApprovals: React.FC<HumanInTheLoopApprovalsProps> = ({
  approvalRequests,
  onApproveRequest,
  onRejectRequest,
  onRequestChanges,
  sendMessage
}) => {
  const [openDialog, setOpenDialog] = React.useState(false);
  const [currentRequest, setCurrentRequest] = React.useState<ApprovalRequest | null>(null);
  const [actionType, setActionType] = React.useState<'reject' | 'changes'>('reject');
  const [reason, setReason] = React.useState('');

  const handleApprove = (id: string) => {
    onApproveRequest(id);
  };

  const handleRejectClick = (request: ApprovalRequest) => {
    setCurrentRequest(request);
    setActionType('reject');
    setReason('');
    setOpenDialog(true);
  };

  const handleRequestChangesClick = (request: ApprovalRequest) => {
    setCurrentRequest(request);
    setActionType('changes');
    setReason('');
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setCurrentRequest(null);
  };

  const handleSubmit = () => {
    if (currentRequest) {
      if (actionType === 'reject') {
        onRejectRequest(currentRequest.id, reason);
      } else {
        onRequestChanges(currentRequest.id, reason);
      }
      handleCloseDialog();
    }
  };

  const getStatusColor = (status: ApprovalRequest['status']) => {
    switch (status) {
      case 'pending': return 'info';
      case 'approved': return 'success';
      case 'rejected': return 'error';
      case 'changes_requested': return 'warning';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Human-in-the-Loop Approvals
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <List>
          {approvalRequests.map((request) => (
            <ListItem key={request.id} divider>
              <ListItemText
                primary={`${request.itemType} Approval: ${request.itemId}`}
                secondary={request.comments || 'No additional comments'}
              />
              <ListItemSecondaryAction>
                {request.status === 'pending' ? (
                  <Box>
                    <Button
                      variant="outlined"
                      color="success"
                      size="small"
                      sx={{ mr: 1 }}
                      onClick={() => handleApprove(request.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      sx={{ mr: 1 }}
                      onClick={() => handleRejectClick(request)}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="outlined"
                      color="warning"
                      size="small"
                      onClick={() => handleRequestChangesClick(request)}
                    >
                      Request Changes
                    </Button>
                  </Box>
                ) : (
                  <Chip label={request.status} color={getStatusColor(request.status)} />
                )}
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      </Paper>

      <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>
          {actionType === 'reject' ? 'Reject Request' : 'Request Changes'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {actionType === 'reject' ? 'Please provide a reason for rejection:' : 'Please specify the changes needed:'}
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label={actionType === 'reject' ? 'Rejection Reason' : 'Changes Required'}
            type="text"
            fullWidth
            multiline
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} color="secondary">
            Cancel
          </Button>
          <Button onClick={handleSubmit} color="primary">
            Submit
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default HumanInTheLoopApprovals;


