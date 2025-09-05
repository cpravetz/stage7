import { verifyComponentCredentials, getServiceRoles, serviceExists, getAllServices } from '../src/models/serviceRegistry';

describe('serviceRegistry', () => {
    let originalProcessEnv: NodeJS.ProcessEnv;
    let consoleErrorSpy: jest.SpyInstance;
    let consoleLogSpy: jest.SpyInstance;

    // Helper to re-import the module to reset its state
    const reimportModule = () => {
        jest.resetModules();
        // Re-assign the exported functions to the outer scope variables
        const newModule = require('../src/models/serviceRegistry');
        Object.assign(exports, newModule);
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Store original process.env and create a writable copy
        originalProcessEnv = process.env;
        process.env = { ...originalProcessEnv };

        // Set default secrets for known services
        process.env.POSTOFFICE_SECRET = 'postoffice-secret';
        process.env.MISSIONCONTROL_SECRET = 'missioncontrol-secret';
        process.env.BRAIN_SECRET = 'brain-secret';
        process.env.LIBRARIAN_SECRET = 'librarian-secret';
        process.env.ENGINEER_SECRET = 'engineer-secret';
        process.env.TRAFFICMANAGER_SECRET = 'trafficmanager-secret';
        process.env.CAPABILITIESMANAGER_SECRET = 'capabilitiesmanager-secret';
        process.env.AGENTSET_SECRET = 'agentset-secret';
        process.env.AGENT_SECRET = 'agent-secret';
        process.env.ERRORHANDLER_SECRET = 'errorhandler-secret';

        // Suppress console logs
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        // Re-import the module to ensure it's initialized with our mocked env
        reimportModule();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        process.env = originalProcessEnv; // Restore original process.env
    });

    describe('verifyComponentCredentials', () => {
        it('should return true for valid component credentials', async () => {
            const isValid = await verifyComponentCredentials('PostOffice', 'postoffice-secret');
            expect(isValid).toBe(true);
        });

        it('should return true for valid shared secret if NODE_ENV is development', async () => {
            process.env.NODE_ENV = 'development';
            process.env.SHARED_CLIENT_SECRET = 'dev-shared-secret';
            reimportModule();

            const isValid = await verifyComponentCredentials('UnknownService', 'dev-shared-secret');
            expect(isValid).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Development mode: accepting any client secret'));
        });

        it('should return false for invalid component credentials', async () => {
            const isValid = await verifyComponentCredentials('PostOffice', 'wrong-secret');
            expect(isValid).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Authentication failed for componentType: PostOffice'));
        });

        it('should return false for unknown service type', async () => {
            const isValid = await verifyComponentCredentials('NonExistentService', 'any-secret');
            expect(isValid).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown service type: NonExistentService'));
        });

        it('should return false for valid shared secret if NODE_ENV is production', async () => {
            process.env.NODE_ENV = 'production';
            process.env.SHARED_CLIENT_SECRET = 'prod-shared-secret';
            reimportModule();

            const isValid = await verifyComponentCredentials('UnknownService', 'prod-shared-secret');
            expect(isValid).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown service type: UnknownService'));
        });
    });

    describe('getServiceRoles', () => {
        it('should return roles for a known service', () => {
            const roles = getServiceRoles('Brain');
            expect(roles).toEqual(['llm:invoke']);
        });

        it('should return empty array for unknown service', () => {
            const roles = getServiceRoles('NonExistentService');
            expect(roles).toEqual([]);
        });
    });

    describe('serviceExists', () => {
        it('should return true for a known service', () => {
            expect(serviceExists('Librarian')).toBe(true);
        });

        it('should return false for an unknown service', () => {
            expect(serviceExists('NonExistentService')).toBe(false);
        });
    });

    describe('getAllServices', () => {
        it('should return all registered service IDs', () => {
            const services = getAllServices();
            expect(services).toEqual(expect.arrayContaining([
                'PostOffice', 'MissionControl', 'Brain', 'Librarian', 'Engineer',
                'TrafficManager', 'CapabilitiesManager', 'AgentSet', 'Agent', 'ErrorHandler',
            ]));
            expect(services.length).toBe(10);
        });
    });
});
