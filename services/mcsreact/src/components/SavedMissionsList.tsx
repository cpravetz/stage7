import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import './SavedMissionsList.css';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  },
});

interface SavedMission {
  id: string;
  name: string;
}

interface SavedMissionsListProps {
  onMissionSelect: (missionId: string) => void;
  onClose: () => void;
}

const SavedMissionsList: React.FC<SavedMissionsListProps> = React.memo(({ onMissionSelect, onClose }) => {
  const [missions, setMissions] = useState<SavedMission[]>([]);

  useEffect(() => {
    const fetchSavedMissions = async () => {
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.error('No auth token found');
        return;
      }

      try {
        const response = await api.get('/getSavedMissions', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        setMissions(response.data);
      } catch (error) {
        console.error('Error fetching saved missions:', error instanceof Error ? error.message : error);
      }
    };

    fetchSavedMissions();
  }, []); // Empty dependency array is correct for a one-time fetch


  return (
    <div className="saved-missions-list">
      <div className="saved-missions-header">
        <h3>Saved Missions</h3>
        <button className="close-button" onClick={onClose}>×</button>
      </div>
      <ul>
        {missions.map((mission) => (
          <li key={mission.id}>
            {/* This inline arrow function is generally okay for keyed lists.
                If SavedMissionsList re-renders frequently due to parent changes
                AND this list is very long, then useCallback could be used here,
                but it's unlikely to be the cause of list *jumping*.
            */}
            <button onClick={() => onMissionSelect(mission.id)}>
              {mission.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
});

export default SavedMissionsList;