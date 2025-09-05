import app from '../src/app';

describe('server', () => {
    let listenSpy: jest.SpyInstance;
    let consoleLogSpy: jest.SpyInstance;
    let originalProcessEnv: NodeJS.ProcessEnv;
    let serverInstance: any; // Declare serverInstance here

    beforeEach(() => {
        jest.clearAllMocks();
        originalProcessEnv = process.env; // Store original process.env
        process.env = { ...originalProcessEnv }; // Create a writable copy

        // Mock app.listen to capture the server instance
        listenSpy = jest.spyOn(app, 'listen').mockImplementation((port, callback) => {
            if (callback) {
                callback(); // Immediately call the callback to simulate server start
            }
            serverInstance = { // Return a mock server instance with a close method
                close: jest.fn((cb) => { if (cb) cb(); })
            };
            return serverInstance;
        });

        // Mock console.log
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        // Re-import server.ts to ensure the mocked app.listen is used
        jest.resetModules(); // Clear module cache
        require('../src/server');
    });

    afterEach(() => {
        listenSpy.mockRestore();
        consoleLogSpy.mockRestore();
        process.env = originalProcessEnv; // Restore original process.env
        if (serverInstance && serverInstance.close) {
            serverInstance.close(); // Close the server instance
        }
    });

    it('should listen on port 3000 by default', () => {
        expect(listenSpy).toHaveBeenCalledWith(3000, expect.any(Function));
        expect(consoleLogSpy).toHaveBeenCalledWith('Marketplace service listening on port 3000');
    });

    it('should listen on the port specified in process.env.PORT', () => {
        process.env.PORT = '8080';
        jest.resetModules(); // Re-import server.ts to pick up new env var
        require('../src/server');

        expect(listenSpy).toHaveBeenCalledWith(8080, expect.any(Function));
        expect(consoleLogSpy).toHaveBeenCalledWith('Marketplace service listening on port 8080');
    });
});
