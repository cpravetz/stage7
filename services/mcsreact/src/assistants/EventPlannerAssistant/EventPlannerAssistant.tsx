import React from 'react';
import EventPlannerAssistantPage from './EventPlannerAssistantPage';

const EventPlannerAssistant:React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <EventPlannerAssistantPage clientId={clientId} />
  );
};

export default EventPlannerAssistant;

