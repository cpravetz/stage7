import request from 'supertest';
import app from '../src/app';
import { PluginMarketplace } from '../src/PluginMarketplace';

// Mock PluginMarketplace
jest.mock('../src/PluginMarketplace');
const mockPluginMarketplace = PluginMarketplace as jest.MockedClass<typeof PluginMarketplace>;

describe('marketplace app routes', () => {
    let mockMarketplaceInstance: jest.Mocked<PluginMarketplace>;

    // Helper to clear the in-memory planTemplates array
    const clearPlanTemplates = () => {
        // Access the private planTemplates array directly for testing purposes
        (app as any)._router.stack.forEach((layer: any) => {
            if (layer.handle.name === 'router') {
                layer.handle.stack.forEach((subLayer: any) => {
                    if (subLayer.handle.name === 'bound dispatch') {
                        // This is a hacky way to get to the in-memory array
                        // In a real app, you'd expose a clear method or use a test DB
                        if (subLayer.handle.toString().includes('planTemplates.push')) {
                            (subLayer.handle as any).__proto__.planTemplates = [];
                        }
                    }
                });
            }
        });
        // A more robust way would be to export the planTemplates array from app.ts for testing
        // For now, let's re-require the module to reset its state
        jest.resetModules();
        const newApp = require('../src/app').default;
        // Replace the app instance with the new one to ensure clean state
        Object.assign(app, newApp);
    };

    beforeEach(() => {
        jest.clearAllMocks();
        clearPlanTemplates(); // Ensure clean state for planTemplates

        // Mock the instance returned by the PluginMarketplace constructor
        mockMarketplaceInstance = {
            fetchOneByVerb: jest.fn().mockResolvedValue(null), // Default: no plugin found
        } as any;
        mockPluginMarketplace.mockImplementation(() => mockMarketplaceInstance);

        // Suppress console logs
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('POST /planTemplates', () => {
        const newTemplate = { id: 'pt1', actionVerb: 'DO_SOMETHING', steps: [] };

        it('should create a new plan template', async () => {
            const res = await request(app).post('/planTemplates').send(newTemplate);
            expect(res.statusCode).toEqual(201);
            expect(res.body).toEqual({ message: 'Plan template created.' });

            const getRes = await request(app).get('/planTemplates/pt1');
            expect(getRes.statusCode).toEqual(200);
            expect(getRes.body).toEqual(newTemplate);
        });

        it('should return 409 if handler for actionVerb already exists (plugin)', async () => {
            mockMarketplaceInstance.fetchOneByVerb.mockResolvedValueOnce({ id: 'plugin1', verb: 'DO_SOMETHING' });

            const res = await request(app).post('/planTemplates').send(newTemplate);
            expect(res.statusCode).toEqual(409);
            expect(res.body).toEqual({ error: 'Handler for this actionVerb already exists.' });
        });

        it('should return 409 if handler for actionVerb already exists (plan template)', async () => {
            await request(app).post('/planTemplates').send(newTemplate);
            const res = await request(app).post('/planTemplates').send({ ...newTemplate, id: 'pt2' }); // Different ID, same verb
            expect(res.statusCode).toEqual(409);
            expect(res.body).toEqual({ error: 'Handler for this actionVerb already exists.' });
        });

        it('should handle internal errors', async () => {
            mockMarketplaceInstance.fetchOneByVerb.mockRejectedValueOnce(new Error('DB error'));
            const res = await request(app).post('/planTemplates').send(newTemplate);
            expect(res.statusCode).toEqual(500);
            expect(res.body).toEqual({ error: 'DB error' });
        });
    });

    describe('GET /planTemplates/:id', () => {
        const existingTemplate = { id: 'pt1', actionVerb: 'DO_SOMETHING', steps: [] };

        beforeEach(async () => {
            await request(app).post('/planTemplates').send(existingTemplate);
        });

        it('should retrieve an existing plan template', async () => {
            const res = await request(app).get('/planTemplates/pt1');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual(existingTemplate);
        });

        it('should return 404 if plan template not found', async () => {
            const res = await request(app).get('/planTemplates/nonexistent');
            expect(res.statusCode).toEqual(404);
            expect(res.body).toEqual({ error: 'Plan template not found.' });
        });
    });

    describe('PUT /planTemplates/:id', () => {
        const existingTemplate = { id: 'pt1', actionVerb: 'DO_SOMETHING', steps: [] };
        const updatedTemplate = { id: 'pt1', actionVerb: 'DO_SOMETHING_ELSE', steps: [{ name: 'step1' }] };

        beforeEach(async () => {
            await request(app).post('/planTemplates').send(existingTemplate);
        });

        it('should update an existing plan template', async () => {
            const res = await request(app).put('/planTemplates/pt1').send(updatedTemplate);
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({ message: 'Plan template updated.' });

            const getRes = await request(app).get('/planTemplates/pt1');
            expect(getRes.statusCode).toEqual(200);
            expect(getRes.body).toEqual(updatedTemplate);
        });

        it('should return 404 if plan template not found', async () => {
            const res = await request(app).put('/planTemplates/nonexistent').send(updatedTemplate);
            expect(res.statusCode).toEqual(404);
            expect(res.body).toEqual({ error: 'Plan template not found.' });
        });

        it('should return 409 if new actionVerb already exists', async () => {
            const anotherTemplate = { id: 'pt2', actionVerb: 'DO_SOMETHING_ELSE', steps: [] };
            await request(app).post('/planTemplates').send(anotherTemplate);

            const res = await request(app).put('/planTemplates/pt1').send(updatedTemplate);
            expect(res.statusCode).toEqual(409);
            expect(res.body).toEqual({ error: 'Handler for this actionVerb already exists.' });
        });

        it('should handle internal errors', async () => {
            mockMarketplaceInstance.fetchOneByVerb.mockRejectedValueOnce(new Error('DB error'));
            const res = await request(app).put('/planTemplates/pt1').send(updatedTemplate);
            expect(res.statusCode).toEqual(500);
            expect(res.body).toEqual({ error: 'DB error' });
        });
    });

    describe('DELETE /planTemplates/:id', () => {
        const existingTemplate = { id: 'pt1', actionVerb: 'DO_SOMETHING', steps: [] };

        beforeEach(async () => {
            await request(app).post('/planTemplates').send(existingTemplate);
        });

        it('should delete an existing plan template', async () => {
            const res = await request(app).delete('/planTemplates/pt1');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({ message: 'Plan template deleted.' });

            const getRes = await request(app).get('/planTemplates/pt1');
            expect(getRes.statusCode).toEqual(404);
        });

        it('should return 404 if plan template not found', async () => {
            const res = await request(app).delete('/planTemplates/nonexistent');
            expect(res.statusCode).toEqual(404);
            expect(res.body).toEqual({ error: 'Plan template not found.' });
        });

        it('should handle internal errors', async () => {
            // Simulate an error during deletion (e.g., if planTemplates was a DB and it failed)
            jest.spyOn((app as any)._router.stack[2].handle.stack[0].handle.__proto__, 'planTemplates', 'get').mockImplementation(() => { throw new Error('Deletion error'); });
            const res = await request(app).delete('/planTemplates/pt1');
            expect(res.statusCode).toEqual(500);
            expect(res.body).toEqual({ error: 'Deletion error' });
        });
    });

    describe('GET /actionVerbHandler/:actionVerb', () => {
        const template = { id: 'pt1', actionVerb: 'TEMPLATE_VERB', steps: [] };
        const plugin = { id: 'plugin1', verb: 'PLUGIN_VERB', language: 'js' };

        beforeEach(async () => {
            await request(app).post('/planTemplates').send(template);
        });

        it('should return plugin handler if found', async () => {
            mockMarketplaceInstance.fetchOneByVerb.mockResolvedValueOnce(plugin);

            const res = await request(app).get('/actionVerbHandler/PLUGIN_VERB');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({ type: 'plugin', handler: plugin });
        });

        it('should return plan template handler if no plugin found', async () => {
            const res = await request(app).get('/actionVerbHandler/TEMPLATE_VERB');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({ type: 'planTemplate', handler: template });
        });

        it('should return 404 if no handler found', async () => {
            const res = await request(app).get('/actionVerbHandler/NON_EXISTENT_VERB');
            expect(res.statusCode).toEqual(404);
            expect(res.body).toEqual({ error: 'No handler found for this actionVerb.' });
        });

        it('should handle internal errors', async () => {
            mockMarketplaceInstance.fetchOneByVerb.mockRejectedValueOnce(new Error('DB error'));
            const res = await request(app).get('/actionVerbHandler/ANY_VERB');
            expect(res.statusCode).toEqual(500);
            expect(res.body).toEqual({ error: 'DB error' });
        });
    });
});
