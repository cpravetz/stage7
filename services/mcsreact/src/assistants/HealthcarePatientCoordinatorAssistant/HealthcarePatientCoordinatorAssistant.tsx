import React from 'react';
import HealthcareAdvisorCoachAssistantPage from './HealthcareAdvisorCoachAssistantPage';

const HealthcarePatientCoordinatorAssistant: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <HealthcareAdvisorCoachAssistantPage clientId={clientId} />
  );
};

export default HealthcarePatientCoordinatorAssistant;


