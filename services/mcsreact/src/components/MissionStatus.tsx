import React from 'react';

interface MissionStatusProps {
  status: {
    id: string;
    name: string;
    status: string;
    progress: number;
    currentPhase: string;
  } | null;
}

const MissionStatus: React.FC<MissionStatusProps> = ({ status }) => {
  if (!status) {
    return <div className="mission-status">No active mission</div>;
  }

  return (
    <div className="mission-status">
      <h2>Mission Status</h2>
      <h3>{status.name}</h3>
      <p>Status: {status.status}</p>
      <p>Progress: {status.progress}%</p>
      <p>Current Phase: {status.currentPhase}</p>
      <div className="progress-bar">
        <div className="progress" style={{ width: `${status.progress}%` }}></div>
      </div>
    </div>
  );
};

export default MissionStatus;