import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, Grid, List, ListItem, ListItemText, LinearProgress, FormControl, InputLabel, Select, MenuItem } from '@mui/material/index.js';

interface StrategicOption {
  id: string;
  name: string;
  description: string;
  expectedImpact: number; // e.g., percentage of revenue increase
  riskLevel: 'Low' | 'Medium' | 'High';
}

const mockStrategicOptions: StrategicOption[] = [
  { id: 's1', name: 'Market Expansion (APAC)', description: 'Expand operations into the Asia-Pacific region.', expectedImpact: 15, riskLevel: 'High' },
  { id: 's2', name: 'New Product Line (AI-driven)', description: 'Launch a new suite of AI-driven products.', expectedImpact: 20, riskLevel: 'Medium' },
  { id: 's3', name: 'Operational Efficiency Initiative', description: 'Invest in automation to reduce operational costs.', expectedImpact: 8, riskLevel: 'Low' },
];

const StrategicDecisionStudio = () => {
  const [options, setOptions] = useState<StrategicOption[]>(mockStrategicOptions);
  const [newOption, setNewOption] = useState<Omit<StrategicOption, 'id'>>({ name: '', description: '', expectedImpact: 0, riskLevel: 'Low' });

  const handleAddOption = () => {
    if (newOption.name && newOption.description) {
      setOptions([...options, { ...newOption, id: String(options.length + 1) }]);
      setNewOption({ name: '', description: '', expectedImpact: 0, riskLevel: 'Low' });
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Strategic Decision Studio
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Propose New Strategic Option
            </Typography>
            <TextField
              label="Option Name"
              fullWidth
              value={newOption.name}
              onChange={(e) => setNewOption({ ...newOption, name: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={3}
              value={newOption.description}
              onChange={(e) => setNewOption({ ...newOption, description: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Expected Impact (%)"
              type="number"
              fullWidth
              value={newOption.expectedImpact}
              onChange={(e) => setNewOption({ ...newOption, expectedImpact: Number(e.target.value) })}
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="risk-level-select-label">Risk Level</InputLabel>
              <Select
                labelId="risk-level-select-label"
                value={newOption.riskLevel}
                label="Risk Level"
                onChange={(e) => setNewOption({ ...newOption, riskLevel: e.target.value as StrategicOption['riskLevel'] })}
              >
                <MenuItem value="Low">Low</MenuItem>
                <MenuItem value="Medium">Medium</MenuItem>
                <MenuItem value="High">High</MenuItem>
              </Select>
            </FormControl>
            <Button variant="contained" onClick={handleAddOption} fullWidth>
              Add Strategic Option
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Current Strategic Options
            </Typography>
            <List>
              {options.map((option) => (
                <ListItem key={option.id} divider>
                  <ListItemText
                    primary={option.name}
                    secondary={
                      <React.Fragment>
                        <Typography component="span" variant="body2" color="text.primary">
                          {option.description}
                        </Typography>
                        <br />
                        Impact: {option.expectedImpact}% | Risk: {option.riskLevel}
                        <Box sx={{ width: '100%', mr: 1 }}>
                          <LinearProgress variant="determinate" value={option.expectedImpact > 100 ? 100 : option.expectedImpact} />
                        </Box>
                      </React.Fragment>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default StrategicDecisionStudio;


