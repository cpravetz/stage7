import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './SavedMissionsList.css';


const API_BASE_URL = 'http://localhost:5020'; 

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
  onClose: () => void;  // Add this line
}

const SavedMissionsList: React.FC<SavedMissionsListProps> = ({ onMissionSelect, onClose }) => {
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
        console.error('Error fetching saved missions:', error);
      }
    };

    fetchSavedMissions();
    }, []);

  
  return (
    <div className="saved-missions-list">
      <div className="saved-missions-header">
        <h3>Saved Missions</h3>
        <button className="close-button" onClick={onClose}>×</button>
      </div>
      <ul>
        {missions.map((mission) => (
          <li key={mission.id}>
            <button onClick={() => onMissionSelect(mission.id)}>
              {mission.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SavedMissionsList;