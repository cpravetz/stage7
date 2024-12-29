import React, { useMemo } from 'react';
import './StatisticsWindow.css';
import { MissionStatistics } from '@cktmcs/shared';

interface Props {
  statistics: MissionStatistics;
  activeMissionName: string | null;
  activeMission: boolean;

}

const StatisticsWindow: React.FC<Props> = ({ statistics, activeMissionName, activeMission }) => {
  const getMissionDisplay = () => {
    if (!activeMission) return "No mission running";
    if (activeMissionName) return activeMissionName;
    return "Unsaved mission";
  };

  const stepStatusTotals: Record<string, number> = useMemo(() => {
    const totals: Record<string, number> = {};
    if (statistics.agentStatistics instanceof Map) {
      for (const agents of statistics.agentStatistics.values()) {
        for (const agent of agents) {
          for (const step of agent.steps) {
            totals[step.status] = (totals[step.status] || 0) + 1;
          }
        }
      }
    }
    return totals;
  }, [statistics.agentStatistics]);

  return (
    <div className="statistics-window">
      <h2>Statistics</h2>
      <p className="mission-status">{getMissionDisplay()}</p>
      <h3>Agents by Status:</h3>
      <ul>
        {Object.entries(statistics.agentCountByStatus).map(([status, count]) => (
          <li key={status}>{status}: {count}</li>
        ))}
      </ul>
      <h3>Steps by Status:</h3>
      <ul>
        {Object.entries(stepStatusTotals).map(([status, count]: [string, number]) => (
          <li key={status}>{status}: {count}</li>
        ))}
      </ul>
      <p>Total LLM Calls: {statistics.llmCalls}</p>
      <h3>New Plugins:</h3>
      <ul className="stat-list">
        {statistics.engineerStatistics.newPlugins.map((plugin: string) => (
          <li key={plugin}>{plugin}</li>
        ))}
      </ul>
    </div>
  );
};

export default StatisticsWindow;