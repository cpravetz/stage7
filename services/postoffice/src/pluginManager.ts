import express from 'express';
import { analyzeError } from '@cktmcs/errorhandler';
import { AxiosInstance } from 'axios';

export class PluginManager {
    private authenticatedApi: AxiosInstance;
    private getComponentUrl: (type: string) => string | undefined;

    constructor(
        authenticatedApi: AxiosInstance,
        getComponentUrl: (type: string) => string | undefined
    ) {
        this.authenticatedApi = authenticatedApi;
        this.getComponentUrl = getComponentUrl;
    }

    setupRoutes(app: express.Application) {
        // Get all plugins
        app.get('/plugins', async (req, res) => {
            try {
                await this.getPlugins(req, res);
            } catch (error) {
                console.error(`Error handling GET /plugins request:`, error);
                res.status(500).json({
                    error: 'Internal server error processing plugins request',
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // Get specific plugin
        app.get('/plugins/:id', async (req, res) => {
            try {
                await this.getPlugin(req, res);
            } catch (error) {
                console.error(`Error handling GET /plugins/${req.params.id} request:`, error);
                res.status(500).json({
                    error: `Internal server error processing plugin request for ${req.params.id}`,
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // Create new plugin
        app.post('/plugins', async (req, res) => {
            try {
                await this.createPlugin(req, res);
            } catch (error) {
                console.error(`Error handling POST /plugins request:`, error);
                res.status(500).json({
                    error: 'Internal server error processing plugin creation request',
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // Update plugin
        app.put('/plugins/:id', async (req, res) => {
            try {
                await this.updatePlugin(req, res);
            } catch (error) {
                console.error(`Error handling PUT /plugins/${req.params.id} request:`, error);
                res.status(500).json({
                    error: `Internal server error processing plugin update request for ${req.params.id}`,
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // Delete plugin
        app.delete('/plugins/:id', async (req, res) => {
            try {
                await this.deletePlugin(req, res);
            } catch (error) {
                console.error(`Error handling DELETE /plugins/${req.params.id} request:`, error);
                res.status(500).json({
                    error: `Internal server error processing plugin delete request for ${req.params.id}`,
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });
    }

    private async getPlugins(req: express.Request, res: express.Response) {
        try {
            const capabilitiesManagerUrl = this.getComponentUrl('CapabilitiesManager');
            if (!capabilitiesManagerUrl) {
                return res.status(500).json({ error: 'CapabilitiesManager service not available' });
            }

            const response = await this.authenticatedApi.get(`http://${capabilitiesManagerUrl}/plugins`);
            res.status(200).json(response.data);
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error getting plugins:', error instanceof Error ? error.message : error);
            res.status(500).json({ error: 'Failed to get plugins' });
        }
    }

    private async getPlugin(req: express.Request, res: express.Response) {
        const { id } = req.params;

        try {
            const capabilitiesManagerUrl = this.getComponentUrl('CapabilitiesManager');
            if (!capabilitiesManagerUrl) {
                return res.status(500).json({ error: 'CapabilitiesManager service not available' });
            }

            const response = await this.authenticatedApi.get(`http://${capabilitiesManagerUrl}/plugins/${id}`);
            res.status(200).json(response.data);
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error getting plugin ${id}:`, error instanceof Error ? error.message : error);
            
            if (error instanceof Error && 'response' in error && (error as any).response?.status === 404) {
                res.status(404).json({ error: 'Plugin not found' });
            } else {
                res.status(500).json({ error: 'Failed to get plugin' });
            }
        }
    }

    private async createPlugin(req: express.Request, res: express.Response) {
        try {
            const capabilitiesManagerUrl = this.getComponentUrl('CapabilitiesManager');
            if (!capabilitiesManagerUrl) {
                return res.status(500).json({ error: 'CapabilitiesManager service not available' });
            }

            const response = await this.authenticatedApi.post(`http://${capabilitiesManagerUrl}/plugins`, req.body);
            res.status(201).json(response.data);
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error creating plugin:', error instanceof Error ? error.message : error);
            
            if (error instanceof Error && 'response' in error && (error as any).response?.status === 400) {
                res.status(400).json({ 
                    error: 'Invalid plugin data',
                    details: (error as any).response?.data?.error || 'Bad request'
                });
            } else {
                res.status(500).json({ error: 'Failed to create plugin' });
            }
        }
    }

    private async updatePlugin(req: express.Request, res: express.Response) {
        const { id } = req.params;

        try {
            const capabilitiesManagerUrl = this.getComponentUrl('CapabilitiesManager');
            if (!capabilitiesManagerUrl) {
                return res.status(500).json({ error: 'CapabilitiesManager service not available' });
            }

            const response = await this.authenticatedApi.put(`http://${capabilitiesManagerUrl}/plugins/${id}`, req.body);
            res.status(200).json(response.data);
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error updating plugin ${id}:`, error instanceof Error ? error.message : error);
            
            if (error instanceof Error && 'response' in error) {
                const status = (error as any).response?.status;
                if (status === 404) {
                    res.status(404).json({ error: 'Plugin not found' });
                } else if (status === 400) {
                    res.status(400).json({ 
                        error: 'Invalid plugin data',
                        details: (error as any).response?.data?.error || 'Bad request'
                    });
                } else {
                    res.status(500).json({ error: 'Failed to update plugin' });
                }
            } else {
                res.status(500).json({ error: 'Failed to update plugin' });
            }
        }
    }

    private async deletePlugin(req: express.Request, res: express.Response) {
        const { id } = req.params;

        try {
            const capabilitiesManagerUrl = this.getComponentUrl('CapabilitiesManager');
            if (!capabilitiesManagerUrl) {
                return res.status(500).json({ error: 'CapabilitiesManager service not available' });
            }

            await this.authenticatedApi.delete(`http://${capabilitiesManagerUrl}/plugins/${id}`);
            res.status(200).json({ message: 'Plugin deleted successfully' });
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error deleting plugin ${id}:`, error instanceof Error ? error.message : error);
            
            if (error instanceof Error && 'response' in error && (error as any).response?.status === 404) {
                res.status(404).json({ error: 'Plugin not found' });
            } else {
                res.status(500).json({ error: 'Failed to delete plugin' });
            }
        }
    }
}
