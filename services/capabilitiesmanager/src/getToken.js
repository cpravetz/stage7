const { ServiceTokenManager } = require('@cktmcs/shared');

async function getToken() {
    try {
        const tokenManager = new ServiceTokenManager(
            'http://securitymanager:5010',
            'CapabilitiesManager',
            process.env.CLIENT_SECRET || 'stage7AuthSecret'
        );
        
        const token = await tokenManager.getToken();
        console.log('Token:', token);
    } catch (error) {
        console.error('Error getting token:', error);
    }
}

getToken();
