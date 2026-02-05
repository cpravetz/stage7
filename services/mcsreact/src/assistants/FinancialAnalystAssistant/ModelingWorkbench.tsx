import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, Grid, List, ListItem, ListItemText, FormControl, InputLabel, Select, MenuItem } from '@mui/material/index.js';

interface FinancialModel {
  id: string;
  name: string;
  type: 'DCF' | 'Comparable Analysis' | 'LBO';
  assumptions: Record<string, number>;
  output: string; // Simplified output for mock
}

const mockFinancialModels: FinancialModel[] = [
  { id: 'm1', name: 'Acme Corp DCF', type: 'DCF', assumptions: { 'Growth Rate': 0.05, 'Discount Rate': 0.10 }, output: 'Valuation: $1.2B' },
  { id: 'm2', name: 'Beta Inc. Comps', type: 'Comparable Analysis', assumptions: { 'Revenue Multiple': 2.5, 'EBITDA Multiple': 10 }, output: 'Valuation Range: $500M - $700M' },
];

const ModelingWorkbench = () => {
  const [models, setModels] = useState<FinancialModel[]>(mockFinancialModels);
  const [selectedModel, setSelectedModel] = useState<FinancialModel | null>(null);
  const [newAssumptionKey, setNewAssumptionKey] = useState<string>('');
  const [newAssumptionValue, setNewAssumptionValue] = useState<number>(0);

  const handleSelectModel = (model: FinancialModel) => {
    setSelectedModel(model);
  };

  const handleUpdateAssumption = () => {
    if (selectedModel && newAssumptionKey) {
      const updatedModels = models.map(m =>
        m.id === selectedModel.id
          ? { ...m, assumptions: { ...m.assumptions, [newAssumptionKey]: newAssumptionValue } }
          : m
      );
      setModels(updatedModels);
      setSelectedModel(updatedModels.find(m => m.id === selectedModel.id) || null);
      setNewAssumptionKey('');
      setNewAssumptionValue(0);
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Modeling Workbench
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 4, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Available Models
            </Typography>
            <List>
              {models.map((model) => (
                <ListItem key={model.id} button onClick={() => handleSelectModel(model)} selected={selectedModel?.id === model.id}>
                  <ListItemText primary={model.name} secondary={model.type} />
                </ListItem>
              ))}
            </List>
          </Grid>
          <Grid {...({ xs: 12, md: 8, item: true } as any)}>
            {selectedModel ? (
              <Box>
                <Typography variant="h6" gutterBottom>
                  {selectedModel.name} ({selectedModel.type})
                </Typography>
                <Typography variant="subtitle1" sx={{ mt: 2 }}>Assumptions:</Typography>
                <List dense>
                  {Object.entries(selectedModel.assumptions).map(([key, value]) => (
                    <ListItem key={key}>
                      <ListItemText primary={`${key}: ${value}`} />
                    </ListItem>
                  ))}
                </List>
                <Typography variant="subtitle1" sx={{ mt: 2 }}>Output:</Typography>
                <Typography variant="body1">{selectedModel.output}</Typography>

                <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
                  Adjust Assumptions
                </Typography>
                <TextField
                  label="Assumption Key"
                  fullWidth
                  value={newAssumptionKey}
                  onChange={(e) => setNewAssumptionKey(e.target.value)}
                  sx={{ mb: 2 }}
                />
                <TextField
                  label="Assumption Value"
                  type="number"
                  fullWidth
                  value={newAssumptionValue}
                  onChange={(e) => setNewAssumptionValue(Number(e.target.value))}
                  sx={{ mb: 2 }}
                />
                <Button variant="contained" onClick={handleUpdateAssumption} fullWidth>
                  Update Assumption
                </Button>
              </Box>
            ) : (
              <Typography variant="body1">Select a model to view details and adjust assumptions.</Typography>
            )}
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default ModelingWorkbench;


