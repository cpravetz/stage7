import React from 'react';
import './MissionControls.css';

interface Props {
  onControl: (action: string) => void;
  activeMission: boolean;
  missionName: string | null;
  activeMissionId: string | null;
  isPaused: boolean;

}

const MissionControls: React.FC<Props> = ({ onControl, activeMission, missionName, activeMissionId, isPaused }) => {
  return (
    <div className="mission-controls">
      <button onClick={() => onControl('resume')} disabled={!activeMission || !isPaused}>Play</button>
      <button onClick={() => onControl('pause')} disabled={!activeMission || isPaused}>Pause</button>
      <button onClick={() => onControl('abort')} disabled={!activeMission}>Abort</button>
      <button onClick={() => onControl('save')} disabled={!activeMission}>Save</button>
      <button onClick={() => onControl('load')} disabled={activeMission}>Load</button>
    </div>
  );
};


export default MissionControls;