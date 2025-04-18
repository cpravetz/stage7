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

        // Check if any of the URLs are undefined or empty
        const validCapabilitiesManagerUrl = capabilitiesManagerUrl || process.env.CAPABILITIESMANAGER_URL || 'capabilitiesmanager:5060';
        const validBrainUrl = brainUrl || process.env.BRAIN_URL || 'brain:5070';
        const validTrafficManagerUrl = trafficManagerUrl || process.env.TRAFFICMANAGER_URL || 'trafficmanager:5080';
        const validLibrarianUrl = librarianUrl || process.env.LIBRARIAN_URL || 'librarian:5040';

        console.log('Service URLs:', {
            capabilitiesManagerUrl: validCapabilitiesManagerUrl,
            brainUrl: validBrainUrl,
            trafficManagerUrl: validTrafficManagerUrl,
            librarianUrl: validLibrarianUrl
        });

        return {
            capabilitiesManagerUrl: validCapabilitiesManagerUrl,
            brainUrl: validBrainUrl,
            trafficManagerUrl: validTrafficManagerUrl,
            librarianUrl: validLibrarianUrl
        };
    } catch (error) {
        console.error('Failed to retrieve service URLs from PostOffice:', error instanceof Error ? error.message : error);
        const fallbackUrls = {
            capabilitiesManagerUrl: process.env.CAPABILITIESMANAGER_URL || 'capabilitiesmanager:5060',
            brainUrl: process.env.BRAIN_URL || 'brain:5070',
            trafficManagerUrl: process.env.TRAFFICMANAGER_URL || 'trafficmanager:5080',
            librarianUrl: process.env.LIBRARIAN_URL || 'librarian:5040'
        };
        console.log('Using fallback service URLs:', fallbackUrls);
        return fallbackUrls;
    }
}
