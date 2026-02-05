import React from 'react';
import CustomerSupportCoachAgentPage from './CustomerSupportCoachAgentPage';

const CustomerSupportAgent: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <CustomerSupportCoachAgentPage clientId={clientId} />
  );
};

export default CustomerSupportAgent;

