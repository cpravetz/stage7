import React, { useState, useMemo } from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, Grid, Divider, IconButton } from '@mui/material/index.js';
import DeleteIcon from '@mui/icons-material/Delete';
import { DragIndicator } from '@mui/icons-material';

interface PlotPoint {
  id: string;
  sequenceNumber: number;
  description: string;
  actNumber?: number;
}

interface PlotStructureHubProps {
  plotPoints: PlotPoint[];
  onCreatePlotPoint: (plotPoint: PlotPoint) => void;
  onDeletePlotPoint: (plotPointId: string) => void;
  onUpdatePlotSequence: (plotPoints: PlotPoint[]) => void;
}

const PlotStructureHub: React.FC<PlotStructureHubProps> = ({
  plotPoints,
  onCreatePlotPoint,
  onDeletePlotPoint,
  onUpdatePlotSequence
}) => {
  const [newPlotPoint, setNewPlotPoint] = useState<Omit<PlotPoint, 'id'>>({ sequenceNumber: 0, description: '', actNumber: 1 });

  const handleAddPlotPoint = () => {
    if (newPlotPoint.description) {
      const newPoint: PlotPoint = {
        id: String(Date.now()),
        sequenceNumber: plotPoints.length + 1,
        description: newPlotPoint.description,
        actNumber: newPlotPoint.actNumber
      };
      onCreatePlotPoint(newPoint);
      setNewPlotPoint({ sequenceNumber: plotPoints.length + 1, description: '', actNumber: 1 });
    }
  };

  const plotPointsByAct = useMemo(() => {
    const grouped: { [key: number]: PlotPoint[] } = { 1: [], 2: [], 3: [] };
    plotPoints.forEach(pp => {
      const act = pp.actNumber || 1;
      if (!grouped[act]) grouped[act] = [];
      grouped[act].push(pp);
    });
    return grouped;
  }, [plotPoints]);

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Plot Structure Hub
      </Typography>
      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Add New Plot Point
        </Typography>
        <TextField
          label="Description"
          fullWidth
          multiline
          rows={2}
          value={newPlotPoint.description}
          onChange={(e) => setNewPlotPoint({ ...newPlotPoint, description: e.target.value })}
          sx={{ mb: 2 }}
        />
        <TextField
          label="Act Number"
          type="number"
          value={newPlotPoint.actNumber || 1}
          onChange={(e) => setNewPlotPoint({ ...newPlotPoint, actNumber: parseInt(e.target.value) || 1 })}
          inputProps={{ min: 1, max: 3 }}
          sx={{ mb: 2 }}
        />
        <Button
          variant="contained"
          onClick={handleAddPlotPoint}
          fullWidth
          disabled={!newPlotPoint.description}
        >
          Add Plot Point
        </Button>
      </Paper>

      <Grid container spacing={2}>
        {[1, 2, 3].map((actNumber) => (
          <Grid {...({ xs: 12, md: 4, key: `act-${actNumber}`, item: true } as any)}>
            <Paper elevation={1} sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Act {actNumber}</Typography>
              <Divider sx={{ mb: 2 }} />
              <List sx={{ maxHeight: 400, overflowY: 'auto' }}>
                {plotPointsByAct[actNumber]?.map((pp) => (
                  <ListItem
                    key={pp.id}
                    divider
                    secondaryAction={
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={() => onDeletePlotPoint(pp.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    }
                  >
                    <ListItemText 
                      primary={`#${pp.sequenceNumber}`}
                      secondary={pp.description}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default PlotStructureHub;


