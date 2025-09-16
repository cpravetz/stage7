import { analyzeError } from '@cktmcs/errorhandler';
import { BaseEntity } from '@cktmcs/shared';

// This utility should be used by an instance of AgentSet, which extends BaseEntity
// We'll get the authenticatedApi from the AgentSet instance

export async function getServiceUrls(entity: BaseEntity): Promise<{
    capabilitiesManagerUrl: string,
    brainUrl: string,
    trafficManagerUrl: string,
    librarianUrl: string,
    missionControlUrl: string
}> {
    try {
        // Use the entity's service URLs method which already uses authenticated API
        const urls = await entity.getServiceUrls();
        const { capabilitiesManagerUrl, brainUrl, trafficManagerUrl, librarianUrl, missionControlUrl } = urls;

        // Check if any of the URLs are undefined or empty
        const validCapabilitiesManagerUrl = capabilitiesManagerUrl || process.env.CAPABILITIESMANAGER_URL || 'capabilitiesmanager:5060';
        const validBrainUrl = brainUrl || process.env.BRAIN_URL || 'brain:5070';
        const validTrafficManagerUrl = trafficManagerUrl || process.env.TRAFFICMANAGER_URL || 'trafficmanager:5080';
        const validLibrarianUrl = librarianUrl || process.env.LIBRARIAN_URL || 'librarian:5040';
        const validMissionControlUrl = missionControlUrl || process.env.MISSIONCONTROL_URL || 'missioncontrol:5030';

        console.log('Service URLs:', {
            capabilitiesManagerUrl: validCapabilitiesManagerUrl,
            brainUrl: validBrainUrl,
            trafficManagerUrl: validTrafficManagerUrl,
            librarianUrl: validLibrarianUrl,
            missionControlUrl: validMissionControlUrl
        });

        return {
            capabilitiesManagerUrl: validCapabilitiesManagerUrl,
            brainUrl: validBrainUrl,
            trafficManagerUrl: validTrafficManagerUrl,
            librarianUrl: validLibrarianUrl,
            missionControlUrl: validMissionControlUrl
        };
    } catch (error) {
        console.error('Failed to retrieve service URLs from PostOffice:', error instanceof Error ? error.message : error);
        const fallbackUrls = {
            capabilitiesManagerUrl: process.env.CAPABILITIESMANAGER_URL || 'capabilitiesmanager:5060',
            brainUrl: process.env.BRAIN_URL || 'brain:5070',
            trafficManagerUrl: process.env.TRAFFICMANAGER_URL || 'trafficmanager:5080',
            librarianUrl: process.env.LIBRARIAN_URL || 'librarian:5040',
            missionControlUrl: process.env.MISSIONCONTROL_URL || 'missioncontrol:5030'
        };
        console.log('Using fallback service URLs:', fallbackUrls);
        return fallbackUrls;
    }
}
