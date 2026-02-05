import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid, FormGroup, FormControlLabel, Checkbox, Button } from '@mui/material';
import {Publish as PublishIcon} from '@mui/icons-material';

interface CrossPlatformPublishingProps {
  publishOptions: Array<{ id: string; name: string; enabled: boolean; }>;
  onPublish: (platforms: string[]) => void;
}

const CrossPlatformPublishing: React.FC<CrossPlatformPublishingProps> = ({ publishOptions, onPublish }) => {
  const [platforms, setPlatforms] = useState<Array<{ id: string; name: string; enabled: boolean; }>>(publishOptions);

  useEffect(() => {
    setPlatforms(publishOptions);
  }, [publishOptions]);

  const handlePlatformToggle = (id: string) => {
    setPlatforms(prev =>
      prev.map(platform =>
        platform.id === id ? { ...platform, enabled: !platform.enabled } : platform
      )
    );
  };

  const handlePublishAll = () => {
    const selectedPlatforms = platforms.filter(p => p.enabled).map(p => p.name);
    if (selectedPlatforms.length > 0) {
      onPublish(selectedPlatforms);
    } else {
      alert('No platforms selected for publishing.');
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Cross-Platform Publishing
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Select Platforms to Publish To
            </Typography>
            <FormGroup>
              {platforms.map((platform) => (
                <FormControlLabel
                  key={platform.id}
                  control={
                    <Checkbox
                      checked={platform.enabled}
                      onChange={() => handlePlatformToggle(platform.id)}
                      name={platform.name}
                    />
                  }
                  label={platform.name}
                />
              ))}
            </FormGroup>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Publish Action
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Choose which platforms to publish your current content to.
            </Typography>
            <Button
              variant="contained"
              startIcon={<PublishIcon />}
              onClick={handlePublishAll}
              fullWidth
            >
              Publish Content
            </Button>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default CrossPlatformPublishing;


