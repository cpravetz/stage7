import React from 'react';
import ContentCreatorCoachAssistantPage from './ContentCreatorCoachAssistantPage';

const ContentCreatorAssistant: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <ContentCreatorCoachAssistantPage clientId={clientId} />
  );
};

export default ContentCreatorAssistant;

