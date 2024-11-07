import axios from 'axios';
import { analyzeError } from '@cktmcs/errorhandler';

const POSTOFFICE_URL = process.env.POSTOFFICE_URL || 'postoffice:5020';
const api = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });

export async function getServiceUrls(): Promise<{
    capabilitiesManagerUrl: string,
    brainUrl: string,
    trafficManagerUrl: string,
    librarianUrl: string
}> {
    try {
        const response = await api.get(`http://${POSTOFFICE_URL}/getServices`);
        const { capabilitiesManagerUrl, brainUrl, trafficManagerUrl, librarianUrl } = response.data;
        return { capabilitiesManagerUrl, brainUrl, trafficManagerUrl, librarianUrl };
    } catch (error) { analyzeError(error as Error);
        console.error('Failed to retrieve service URLs from PostOffice:', error instanceof Error ? error.message : error);
        throw new Error('Failed to retrieve service URLs.');
    }
}
