import React from 'react';
import { Box, Button, ButtonGroup, Typography, Chip, useTheme } from '@mui/material/index.js';
import { List as ListIcon, FolderOpen as FolderOpenIcon, Save as SaveIcon, Stop as StopIcon, Pause as PauseIcon, PlayArrow as PlayArrowIcon } from '@mui/icons-material';

interface Props {
  onControl: (action: string) => void;
  activeMission: boolean;
  missionName: string | null;
  activeMissionId: string | null;
  isPaused: boolean;

}

const MissionControls: React.FC<Props> = ({ onControl, activeMission, missionName, activeMissionId, isPaused }) => {
  const theme = useTheme();

  return (
    <Box sx={{
      p: 1,
      borderRadius: 2,
      bgcolor: 'background.paper',
      boxShadow: 1,
      display: 'flex',
      flexDirection: { xs: 'column', sm: 'row' },
      alignItems: { xs: 'stretch', sm: 'center' },
      justifyContent: 'space-between',
      gap: 1
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 'medium' }}>
          Mission:
        </Typography>
        {activeMission ? (
          <Chip
            label={missionName || 'Active Mission'}
            color="primary"
            variant="outlined"
            size="small"
          />
        ) : (
          <Chip
            label="No Active Mission"
            color="default"
            variant="outlined"
            size="small"
          />
        )}
        {isPaused && activeMission && (
          <Chip
            label="PAUSED"
            color="warning"
            size="small"
          />
        )}
      </Box>

      <ButtonGroup variant="contained" size="small" aria-label="mission control buttons">
        <Button
          onClick={() => onControl('resume')}
          disabled={!activeMission || !isPaused}
          title="Play"
        >
          <PlayArrowIcon />
        </Button>
        <Button
          onClick={() => onControl('pause')}
          disabled={!activeMission || isPaused}
          title="Pause"
        >
          <PauseIcon />
        </Button>
        <Button
          onClick={() => onControl('abort')}
          disabled={!activeMission}
          title="Abort"
        >
          <StopIcon />
        </Button>
        <Button
          onClick={() => onControl('save')}
          disabled={!activeMission}
          title="Save"
        >
          <SaveIcon />
        </Button>
        <Button
          onClick={() => onControl('load')}
          disabled={activeMission}
          title="Load"
        >
          <FolderOpenIcon />
        </Button>
      </ButtonGroup>
    </Box>
  );
};


export default MissionControls;