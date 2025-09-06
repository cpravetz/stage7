import React from 'react';
import { Box, Button, ButtonGroup, Typography, Chip, useTheme } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import StopIcon from '@mui/icons-material/Stop';
import SaveIcon from '@mui/icons-material/Save';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ListIcon from '@mui/icons-material/List';

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
      p: 2,
      borderRadius: 2,
      bgcolor: 'background.paper',
      boxShadow: 1,
      display: 'flex',
      flexDirection: { xs: 'column', sm: 'row' },
      alignItems: { xs: 'stretch', sm: 'center' },
      justifyContent: 'space-between',
      gap: 2
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
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

      <ButtonGroup variant="contained" aria-label="mission control buttons">
        <Button
          onClick={() => onControl('resume')}
          disabled={!activeMission || !isPaused}
          startIcon={<PlayArrowIcon />}
          color="success"
          sx={{ minWidth: '100px' }}
        >
          Play
        </Button>
        <Button
          onClick={() => onControl('pause')}
          disabled={!activeMission || isPaused}
          startIcon={<PauseIcon />}
          color="warning"
          sx={{ minWidth: '100px' }}
        >
          Pause
        </Button>
        <Button
          onClick={() => onControl('abort')}
          disabled={!activeMission}
          startIcon={<StopIcon />}
          color="error"
          sx={{ minWidth: '100px' }}
        >
          Abort
        </Button>
        <Button
          onClick={() => onControl('save')}
          disabled={!activeMission}
          startIcon={<SaveIcon />}
          color="info"
          sx={{ minWidth: '100px' }}
        >
          Save
        </Button>
        <Button
          onClick={() => onControl('load')}
          disabled={activeMission}
          startIcon={<FolderOpenIcon />}
          color="secondary"
          sx={{ minWidth: '100px' }}
        >
          Load
        </Button>
      </ButtonGroup>
    </Box>
  );
};


export default MissionControls;