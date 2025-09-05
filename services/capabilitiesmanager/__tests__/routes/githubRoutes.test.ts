import express from 'express';
import request from 'supertest';
import githubRoutes from '../src/routes/githubRoutes';
import { PluginMarketplace } from '@cktmcs/marketplace';
import { analyzeError } from '@cktmcs/errorhandler';

// Mock external dependencies
jest.mock('@cktmcs/marketplace');
jest.mock('@cktmcs/errorhandler');
jest.mock('dotenv', () => ({
    config: jest.fn(),
}));

const mockPluginMarketplaceInstance = {
    getRepositories: jest.fn(),
    list: jest.fn(),
    fetch: jest.fn(),
    store: jest.fn(),
    delete: jest.fn(),
};

// Mock the constructor of PluginMarketplace to return our mock instance
(PluginMarketplace as jest.Mock).mockImplementation(() => mockPluginMarketplaceInstance);

const mockPluginRegistry = {
    updatePluginMarketplace: jest.fn(),
};

// Create a mock Express app to test routes
const app = express();
app.use(express.json());
app.use((req, res, next) => {
    // Attach mock pluginRegistry to req.app
    (req as any).app = { get: jest.fn().mockReturnValue(mockPluginRegistry) };
    next();
});
app.use('/github', githubRoutes);

describe('githubRoutes', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        jest.clearAllMocks();
        originalEnv = process.env;
        process.env = { ...originalEnv }; // Copy process.env

        // Default mock for getRepositories to return a map with a mock repo
        mockPluginMarketplaceInstance.getRepositories.mockReturnValue(new Map([
            ['github', {
                list: jest.fn().mockResolvedValue([]),
                fetch: jest.fn().mockResolvedValue(null),
                store: jest.fn().mockResolvedValue(undefined),
                delete: jest.fn().mockResolvedValue(undefined),
            }],
            ['local', {
                list: jest.fn().mockResolvedValue([]),
                fetch: jest.fn().mockResolvedValue(null),
                store: jest.fn().mockResolvedValue(undefined),
                delete: jest.fn().mockResolvedValue(undefined),
            }],
        ]));
    });

    afterEach(() => {
        process.env = originalEnv; // Restore original process.env
    });

    describe('GET /github/config', () => {
        it('should return GitHub configuration when enabled and configured', async () => {
            process.env.ENABLE_GITHUB = 'true';
            process.env.GITHUB_USERNAME = 'testuser';
            process.env.GIT_REPOSITORY_URL = 'testrepo';
            process.env.GITHUB_TOKEN = 'testtoken';

            const res = await request(app).get('/github/config');

            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({
                enabled: true,
                username: 'testuser',
                repository: 'testrepo',
                configured: true,
                token: true,
            });
        });

        it('should return GitHub configuration when disabled', async () => {
            process.env.ENABLE_GITHUB = 'false';
            process.env.GITHUB_USERNAME = 'testuser';
            process.env.GIT_REPOSITORY_URL = 'testrepo';
            process.env.GITHUB_TOKEN = 'testtoken';

            const res = await request(app).get('/github/config');

            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({
                enabled: false,
                username: 'testuser',
                repository: 'testrepo',
                configured: false,
                token: true,
            });
        });

        it('should return configured: false if token is missing', async () => {
            process.env.ENABLE_GITHUB = 'true';
            process.env.GITHUB_USERNAME = 'testuser';
            process.env.GIT_REPOSITORY_URL = 'testrepo';
            delete process.env.GITHUB_TOKEN;

            const res = await request(app).get('/github/config');

            expect(res.statusCode).toEqual(200);
            expect(res.body.configured).toBe(false);
            expect(res.body.token).toBe(false);
        });

        it('should handle errors', async () => {
            (analyzeError as jest.Mock).mockImplementationOnce(() => {}); // Prevent actual error logging
            // Simulate an error by making process.env.ENABLE_GITHUB throw
            Object.defineProperty(process.env, 'ENABLE_GITHUB', {
                get: jest.fn(() => { throw new Error('Test error'); }),
            });

            const res = await request(app).get('/github/config');

            expect(res.statusCode).toEqual(500);
            expect(res.body).toEqual({ error: 'Failed to get GitHub configuration' });
            expect(analyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('POST /github/config', () => {
        it('should update GitHub configuration and reinitialize marketplace', async () => {
            const newConfig = {
                token: 'newtoken',
                username: 'newuser',
                repository: 'newrepo',
                enable: true,
            };

            const res = await request(app).post('/github/config').send(newConfig);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({
                success: true,
                message: 'GitHub configuration updated successfully',
                enabled: true,
            });
            expect(process.env.GITHUB_TOKEN).toBe('newtoken');
            expect(process.env.GITHUB_USERNAME).toBe('newuser');
            expect(process.env.GIT_REPOSITORY_URL).toBe('newrepo');
            expect(process.env.ENABLE_GITHUB).toBe('true');
            expect(mockPluginRegistry.updatePluginMarketplace).toHaveBeenCalledTimes(1);
            expect(PluginMarketplace).toHaveBeenCalledTimes(2); // Once in module scope, once for reinit
        });

        it('should handle missing required fields', async () => {
            const newConfig = {
                username: 'newuser',
                repository: 'newrepo',
                enable: true,
            };

            const res = await request(app).post('/github/config').send(newConfig);

            expect(res.statusCode).toEqual(400);
            expect(res.body).toEqual({ error: 'Missing required fields: token, username, repository' });
        });

        it('should handle errors during update', async () => {
            (analyzeError as jest.Mock).mockImplementationOnce(() => {});
            // Simulate an error by making process.env.GITHUB_TOKEN throw
            Object.defineProperty(process.env, 'GITHUB_TOKEN', {
                set: jest.fn(() => { throw new Error('Test error'); }),
            });

            const newConfig = {
                token: 'newtoken',
                username: 'newuser',
                repository: 'newrepo',
                enable: true,
            };

            const res = await request(app).post('/github/config').send(newConfig);

            expect(res.statusCode).toEqual(500);
            expect(res.body).toEqual({ error: 'Failed to update GitHub configuration' });
            expect(analyzeError).toHaveBeenCalledTimes(1);
        });

        it('should log warning if pluginRegistry is not available for reinitialization', async () => {
            (app as any).get.mockReturnValueOnce(undefined); // Simulate pluginRegistry not found
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            const newConfig = {
                token: 'newtoken',
                username: 'newuser',
                repository: 'newrepo',
                enable: true,
            };

            await request(app).post('/github/config').send(newConfig);

            expect(consoleWarnSpy).toHaveBeenCalledWith('Could not access plugin registry to reinitialize marketplace');
            consoleWarnSpy.mockRestore();
        });

        it('should log error if reinitialization fails', async () => {
            mockPluginRegistry.updatePluginMarketplace.mockImplementationOnce(() => { throw new Error('Reinit failed'); });
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const newConfig = {
                token: 'newtoken',
                username: 'newuser',
                repository: 'newrepo',
                enable: true,
            };

            await request(app).post('/github/config').send(newConfig);

            expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to reinitialize plugin marketplace:', expect.any(Error));
            consoleErrorSpy.mockRestore();
        });
    });

    describe('GET /github/plugins', () => {
        it('should list plugins from default github repository', async () => {
            const mockPlugins = [{ id: 'p1' }, { id: 'p2' }];
            const mockRepo = mockPluginMarketplaceInstance.getRepositories().get('github');
            (mockRepo as any).list.mockResolvedValueOnce(mockPlugins);

            const res = await request(app).get('/github/plugins');

            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({ plugins: mockPlugins });
            expect((mockRepo as any).list).toHaveBeenCalledTimes(1);
        });

        it('should list plugins from specified repository', async () => {
            const mockPlugins = [{ id: 'p3' }];
            const mockRepo = mockPluginMarketplaceInstance.getRepositories().get('local');
            (mockRepo as any).list.mockResolvedValueOnce(mockPlugins);

            const res = await request(app).get('/github/plugins?repository=local');

            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({ plugins: mockPlugins });
            expect((mockRepo as any).list).toHaveBeenCalledTimes(1);
        });

        it('should return 404 if repository not configured', async () => {
            mockPluginMarketplaceInstance.getRepositories.mockReturnValue(new Map()); // No repos configured

            const res = await request(app).get('/github/plugins?repository=nonexistent');

            expect(res.statusCode).toEqual(404);
            expect(res.body).toEqual({ error: 'nonexistent repository not configured' });
        });

        it('should handle errors', async () => {
            (analyzeError as jest.Mock).mockImplementationOnce(() => {});
            const mockRepo = mockPluginMarketplaceInstance.getRepositories().get('github');
            (mockRepo as any).list.mockRejectedValueOnce(new Error('List error'));

            const res = await request(app).get('/github/plugins');

            expect(res.statusCode).toEqual(500);
            expect(res.body).toEqual({ error: 'Failed to list plugins' });
            expect(analyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('GET /github/plugins/:id', () => {
        it('should fetch a plugin by ID from default github repository', async () => {
            const mockPlugin = { id: 'p1', name: 'Plugin 1' };
            const mockRepo = mockPluginMarketplaceInstance.getRepositories().get('github');
            (mockRepo as any).fetch.mockResolvedValueOnce(mockPlugin);

            const res = await request(app).get('/github/plugins/p1');

            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({ plugin: mockPlugin });
            expect((mockRepo as any).fetch).toHaveBeenCalledWith('p1');
        });

        it('should fetch a plugin by ID from specified repository', async () => {
            const mockPlugin = { id: 'p2', name: 'Plugin 2' };
            const mockRepo = mockPluginMarketplaceInstance.getRepositories().get('local');
            (mockRepo as any).fetch.mockResolvedValueOnce(mockPlugin);

            const res = await request(app).get('/github/plugins/p2?repository=local');

            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({ plugin: mockPlugin });
            expect((mockRepo as any).fetch).toHaveBeenCalledWith('p2');
        });

        it('should return 404 if repository not configured', async () => {
            mockPluginMarketplaceInstance.getRepositories.mockReturnValue(new Map());

            const res = await request(app).get('/github/plugins/p1?repository=nonexistent');

            expect(res.statusCode).toEqual(404);
            expect(res.body).toEqual({ error: 'nonexistent repository not configured' });
        });

        it('should return 404 if plugin not found', async () => {
            const mockRepo = mockPluginMarketplaceInstance.getRepositories().get('github');
            (mockRepo as any).fetch.mockResolvedValueOnce(null);

            const res = await request(app).get('/github/plugins/nonexistent');

            expect(res.statusCode).toEqual(404);
            expect(res.body).toEqual({ error: 'Plugin not found' });
        });

        it('should handle errors', async () => {
            (analyzeError as jest.Mock).mockImplementationOnce(() => {});
            const mockRepo = mockPluginMarketplaceInstance.getRepositories().get('github');
            (mockRepo as any).fetch.mockRejectedValueOnce(new Error('Fetch error'));

            const res = await request(app).get('/github/plugins/p1');

            expect(res.statusCode).toEqual(500);
            expect(res.body).toEqual({ error: 'Failed to get plugin' });
            expect(analyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('POST /github/plugins', () => {
        const mockPluginData = { id: 'new-plugin', name: 'New Plugin' };

        it('should store a plugin in default github repository', async () => {
            const mockRepo = mockPluginMarketplaceInstance.getRepositories().get('github');
            (mockRepo as any).store.mockResolvedValueOnce(undefined);

            const res = await request(app).post('/github/plugins').send(mockPluginData);

            expect(res.statusCode).toEqual(201);
            expect(res.body).toEqual({ success: true });
            expect((mockRepo as any).store).toHaveBeenCalledWith(mockPluginData);
        });

        it('should store a plugin in specified repository', async () => {
            const mockRepo = mockPluginMarketplaceInstance.getRepositories().get('local');
            (mockRepo as any).store.mockResolvedValueOnce(undefined);

            const res = await request(app).post('/github/plugins?repository=local').send(mockPluginData);

            expect(res.statusCode).toEqual(201);
            expect(res.body).toEqual({ success: true });
            expect((mockRepo as any).store).toHaveBeenCalledWith(mockPluginData);
        });

        it('should return 404 if repository not configured', async () => {
            mockPluginMarketplaceInstance.getRepositories.mockReturnValue(new Map());

            const res = await request(app).post('/github/plugins?repository=nonexistent').send(mockPluginData);

            expect(res.statusCode).toEqual(404);
            expect(res.body).toEqual({ error: 'nonexistent repository not configured' });
        });

        it('should handle errors', async () => {
            (analyzeError as jest.Mock).mockImplementationOnce(() => {});
            const mockRepo = mockPluginMarketplaceInstance.getRepositories().get('github');
            (mockRepo as any).store.mockRejectedValueOnce(new Error('Store error'));

            const res = await request(app).post('/github/plugins').send(mockPluginData);

            expect(res.statusCode).toEqual(500);
            expect(res.body).toEqual({ error: 'Failed to create plugin' });
            expect(analyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('PUT /github/plugins/:id', () => {
        const mockPluginData = { id: 'update-plugin', name: 'Updated Plugin' };

        it('should update a plugin in default github repository', async () => {
            const mockRepo = mockPluginMarketplaceInstance.getRepositories().get('github');
            (mockRepo as any).store.mockResolvedValueOnce(undefined);

            const res = await request(app).put('/github/plugins/update-plugin').send(mockPluginData);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({ success: true });
            expect((mockRepo as any).store).toHaveBeenCalledWith(mockPluginData);
        });

        it('should update a plugin in specified repository', async () => {
            const mockRepo = mockPluginMarketplaceInstance.getRepositories().get('local');
            (mockRepo as any).store.mockResolvedValueOnce(undefined);

            const res = await request(app).put('/github/plugins/update-plugin?repository=local').send(mockPluginData);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({ success: true });
            expect((mockRepo as any).store).toHaveBeenCalledWith(mockPluginData);
        });

        it('should return 404 if repository not configured', async () => {
            mockPluginMarketplaceInstance.getRepositories.mockReturnValue(new Map());

            const res = await request(app).put('/github/plugins/update-plugin?repository=nonexistent').send(mockPluginData);

            expect(res.statusCode).toEqual(404);
            expect(res.body).toEqual({ error: 'nonexistent repository not configured' });
        });

        it('should handle errors', async () => {
            (analyzeError as jest.Mock).mockImplementationOnce(() => {});
            const mockRepo = mockPluginMarketplaceInstance.getRepositories().get('github');
            (mockRepo as any).store.mockRejectedValueOnce(new Error('Update error'));

            const res = await request(app).put('/github/plugins/update-plugin').send(mockPluginData);

            expect(res.statusCode).toEqual(500);
            expect(res.body).toEqual({ error: 'Failed to update plugin' });
            expect(analyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('DELETE /github/plugins/:id', () => {
        it('should delete a plugin from default github repository', async () => {
            const mockRepo = mockPluginMarketplaceInstance.getRepositories().get('github');
            (mockRepo as any).delete.mockResolvedValueOnce(undefined);

            const res = await request(app).delete('/github/plugins/delete-plugin');

            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({ success: true, message: 'Plugin deleted successfully' });
            expect((mockRepo as any).delete).toHaveBeenCalledWith('delete-plugin');
        });

        it('should delete a plugin from specified repository', async () => {
            const mockRepo = mockPluginMarketplaceInstance.getRepositories().get('local');
            (mockRepo as any).delete.mockResolvedValueOnce(undefined);

            const res = await request(app).delete('/github/plugins/delete-plugin?repository=local');

            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({ success: true, message: 'Plugin deleted successfully' });
            expect((mockRepo as any).delete).toHaveBeenCalledWith('delete-plugin');
        });

        it('should return 404 if repository not configured', async () => {
            mockPluginMarketplaceInstance.getRepositories.mockReturnValue(new Map());

            const res = await request(app).delete('/github/plugins/delete-plugin?repository=nonexistent');

            expect(res.statusCode).toEqual(404);
            expect(res.body).toEqual({ error: 'nonexistent repository not configured' });
        });

        it('should handle errors', async () => {
            (analyzeError as jest.Mock).mockImplementationOnce(() => {});
            const mockRepo = mockPluginMarketplaceInstance.getRepositories().get('github');
            (mockRepo as any).delete.mockRejectedValueOnce(new Error('Delete error'));

            const res = await request(app).delete('/github/plugins/delete-plugin');

            expect(res.statusCode).toEqual(500);
            expect(res.body).toEqual({ error: 'Failed to delete plugin' });
            expect(analyzeError).toHaveBeenCalledTimes(1);
        });
    });
});
