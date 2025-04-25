import express from 'express';
import bodyParser from 'body-parser';
import { OptimizationType, ModelManager } from './utils/modelManager';
import { LLMConversationType } from './interfaces/baseInterface';
import { ExchangeType } from './services/baseService';
import { BaseEntity } from '@cktmcs/shared';
import dotenv from 'dotenv';
import { analyzeError } from '@cktmcs/errorhandler';
import fetch from 'node-fetch';

dotenv.config();

interface Thread {
    exchanges: ExchangeType;
    optimization?: OptimizationType;
    optionals?: Record<string, any>;
    conversationType?: LLMConversationType;
}

const app = express();
const port = process.env.PORT || 5070;

export class Brain extends BaseEntity {
    private modelManager: ModelManager;
    private llmCalls: number = 0;

    private librarianUrl: string | null = null;
    private performanceDataSyncInterval: NodeJS.Timeout | null = null;

    constructor() {
        super('Brain', 'Brain', `brain`, process.env.PORT || '5020');
        this.modelManager = new ModelManager();

        // Clear any existing blacklists to start with a clean slate
        //this.modelManager.resetAllBlacklists();

        this.init();

        // Start periodic sync of performance data to Librarian
        this.setupPerformanceDataSync();
    }

    init() {
        // Middleware
        app.use(bodyParser.json());

        // Use the BaseEntity verifyToken method for authentication
        app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
            // Skip authentication for health endpoint
            if (req.path === '/health') {
                return next();
            }

            // Use the BaseEntity verifyToken method
            this.verifyToken(req, res, next);
        });

        // Add health check endpoint
        app.get('/health', (_req: express.Request, res: express.Response) => {
            res.json({ status: 'ok', message: 'Brain service is running' });
        });

        // Global error handler
        app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
            console.error('Express error in Brain:', err instanceof Error ? err.message : String(err));
            analyzeError(err as Error);
            res.status(501).json({ error: 'Internal server error' });
        });

        // API endpoint for processThread
        app.post('/chat', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                await this.chat(req, res);
            } catch (error) {
                next(error); // Pass errors to the global error handler
            }
        });

        app.post('/generate', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                await this.generate(req, res);
            } catch (error) {
                next(error); // Pass errors to the global error handler
            }
        });

        //API endpoint to report LLMCall total
        app.get('/getLLMCalls', (_req: express.Request, res: express.Response) => {
            res.json({ llmCalls: this.llmCalls });
        });

        // API endpoint to get available models
        app.get('/models', (_req: express.Request, res: express.Response) => {
            const models = this.getAvailableModels();
            res.json({ models });
        });

        // API endpoint to reset all blacklisted models
        app.post('/performance/reset-blacklists', (_req: express.Request, res: express.Response) => {
            try {
                this.modelManager.resetAllBlacklists();
                res.json({ success: true, message: 'All blacklisted models have been reset' });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).json({ error: 'Failed to reset blacklisted models' });
            }
        });

        // API endpoint to get performance data for all models
        app.get('/performance', (_req: express.Request, res: express.Response) => {
            try {
                const performanceData = this.modelManager.performanceTracker.getAllPerformanceData();
                res.json({ success: true, performanceData });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).json({ error: 'Failed to get performance data' });
            }
        });

        // API endpoint to get model rankings
        app.get('/performance/rankings', (req: express.Request, res: express.Response) => {
            try {
                const conversationType = req.query.conversationType as string || 'text/text';
                const metric = req.query.metric as 'successRate' | 'averageLatency' | 'overall' || 'overall';
                const rankings = this.modelManager.getModelRankings(conversationType, metric);
                res.json({ success: true, rankings });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).json({ error: 'Failed to get model rankings' });
            }
        });

        // Start the server
        app.listen(Number(port), '0.0.0.0', () => {
            console.log(`Brain service listening at http://0.0.0.0:${port}`);
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            analyzeError(error);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            if (reason instanceof Error) {
                analyzeError(reason);
            }
        });
    }

    async generate(req: express.Request, res: express.Response) {
        try {
            const modelName = req.body.modelName;
            const optimization = req.body.optimization;
            const conversationType = req.body.conversationType;
            const model = modelName ? this.modelManager.getModel(modelName) : this.modelManager.selectModel(optimization, conversationType);

            if (!model || !model.isAvailable() || !model.service) {
                res.json({ response: 'No suitable model found.', mimeType: 'text/plain' });
                console.log('No suitable model found.');
            } else {
                const convertParams = req.body.convertParams;
                convertParams.max_length = convertParams.max_length ? Math.min(convertParams.max_length, model.tokenLimit) : model.tokenLimit;
                this.llmCalls++;
                model.llminterface?.convert(model.service, conversationType, convertParams);
            }
        } catch (error) {
            analyzeError(error as Error);
            res.status(400).json({ error: 'Invalid request' });
        }
    }

    async chat(req: express.Request, res: express.Response) {
        try {
            console.log(`Chat request received`);

            const thread = {
                exchanges: req.body.exchanges,
                optimization: req.body.optimization,
                optionals: req.body.optionals || {},
                conversationType: req.body.ConversationType || LLMConversationType.TextToText
            };

            // Select model based on provided name or optimization criteria
            const selectedModel = req.body.model ?
                this.modelManager.getModel(req.body.model) :
                this.modelManager.selectModel(thread.optimization, thread.conversationType);

            if (!selectedModel) {
                res.json({ response: 'No suitable model found.', mimeType: 'text/plain' });
                console.log('No suitable model found.');
            } else {
                console.log(`Chatting with model ${selectedModel.modelName} using interface ${selectedModel.interfaceName} and conversation type ${thread.conversationType}`);

                // Extract only the message content from the exchanges
                const messages = thread.exchanges;

                // Validate message format
                if (messages && Array.isArray(messages)) {
                    for (let i = 0; i < messages.length; i++) {
                        const msg = messages[i];
                        // Check if the message has the required properties
                        if (!msg.role || !msg.content) {
                            console.log(`Warning: Message at index ${i} is missing role or content:`, msg);
                            // Try to fix the message if possible
                            if (!msg.role) msg.role = 'user';
                            if (!msg.content && (msg as any).message) {
                                msg.content = (msg as any).message;
                                console.log(`Fixed message at index ${i} by using 'message' property as 'content'`);
                            }
                        }
                    }
                } else {
                    console.log('Warning: messages is not an array or is undefined');
                }
                this.llmCalls++;
                thread.optionals.modelName = selectedModel.modelName;

                console.log('Chat messages provided:', JSON.stringify(messages, null, 2));

                // Check if the message content is too long and might be getting truncated
                if (messages && messages.length > 0 && messages[0].content) {
                    const contentLength = messages[0].content.length;
                    console.log(`First message content length: ${contentLength} characters`);

                    // If content is very long, log a warning
                    if (contentLength > 10000) {
                        console.log('WARNING: Message content is very long and might be truncated');
                    }
                }

                // Ensure response_format is set for JSON responses if the prompt requests JSON
                if (messages && messages.length > 0 && messages[0].content &&
                    (messages[0].content.includes('JSON') || messages[0].content.includes('json'))) {
                    console.log('JSON format detected in prompt, setting response_format to JSON');
                    if (!thread.optionals) thread.optionals = {};
                    thread.optionals.response_format = { type: 'json_object' };
                }
                // Track the request
                const requestId = this.modelManager.trackModelRequest(
                    selectedModel.modelName,
                    thread.conversationType,
                    JSON.stringify(messages)
                );

                try {

                    // Pass optionals to the model, including response_format if specified
                    console.log(`Brain: Passing optionals to model: ${JSON.stringify(thread.optionals)}`);
                    const modelResponse = await selectedModel.chat(messages, thread.optionals || {});
                    console.log(`Model response received:`,modelResponse);

                    // Track successful response
                    this.modelManager.trackModelResponse(
                        requestId,
                        modelResponse,
                        modelResponse.length,
                        true
                    );

                    if (!modelResponse || modelResponse == 'No response generated') {
                        // Return a simple error response
                        res.status(500).json({ error: 'No response generated' });
                        return;
                    }

                    const mimeType = this.determineMimeType(modelResponse);
                    res.json({
                        response: modelResponse,
                        mimeType: mimeType
                    });
                } catch (error) {
                    // Track failed response
                    this.modelManager.trackModelResponse(
                        requestId,
                        '',
                        0,
                        false,
                        error instanceof Error ? error.message : String(error)
                    );

                    // Return error response
                    console.log(`Error with model ${selectedModel.modelName}:`, error instanceof Error ? error.message : String(error));
                    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
                }
            }
        } catch (error) {
            console.log('Chat Error in Brain:', error instanceof Error ? error.message : String(error));
            analyzeError(error as Error);
            res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
        }
    }

    /**
     * Get a list of all available models.
     */
    getAvailableModels(): string[] {
        return this.modelManager.getAvailableModels();
    }

    private determineMimeType(response: string): string {
        if (!response || typeof response !== 'string') {
            console.log('Invalid response type in determineMimeType:', typeof response);
            return 'text/plain';
        }

        if (response.startsWith('<html>')) {
            return 'text/html';
        }

        // Check if the response is JSON
        try {
            // Look for JSON structure - more permissive check
            const trimmed = response.trim();
            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                // Try to parse it to confirm it's valid JSON
                try {
                    JSON.parse(trimmed);
                    console.log('Detected valid JSON response, setting MIME type to application/json');
                    return 'application/json';
                } catch (parseError) {
                    console.log('Response looks like JSON but failed to parse:', parseError instanceof Error ? parseError.message : String(parseError));
                    // Continue to check for code blocks
                }
            }
        } catch (e) {
            // Not valid JSON, continue with text/plain
            console.log('Response is not valid JSON, using text/plain');
        }

        // Log the first 100 characters of the response for debugging
        console.log(`Response preview (first 100 chars): ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`);

        return 'text/plain';
    }

    /**
     * Set up periodic sync of performance data to Librarian
     */
    private setupPerformanceDataSync() {
        // First, try to discover the Librarian service
        this.discoverLibrarianService();

        // Set up interval to sync performance data every 5 minutes
        this.performanceDataSyncInterval = setInterval(() => {
            this.syncPerformanceDataToLibrarian();
        }, 5 * 60 * 1000); // 5 minutes

        // Also sync immediately on startup
        setTimeout(() => {
            this.syncPerformanceDataToLibrarian();
        }, 10000); // Wait 10 seconds after startup to give Librarian time to be available
    }

    /**
     * Discover the Librarian service URL
     */
    private async discoverLibrarianService() {
        try {
            // Try to discover using service discovery
            if (this.serviceDiscovery) {
                const url = await this.serviceDiscovery.discoverService('Librarian');
                if (url) {
                    this.librarianUrl = url;
                    console.log(`Discovered Librarian service at ${url}`);
                    return;
                }
            }

            // Fall back to environment variable
            const envUrl = process.env.LIBRARIAN_URL;
            if (envUrl) {
                this.librarianUrl = envUrl;
                console.log(`Using Librarian URL from environment: ${envUrl}`);
                return;
            }

            // Default fallback
            this.librarianUrl = 'librarian:5040';
            console.log(`Using default Librarian URL: ${this.librarianUrl}`);
        } catch (error) {
            console.error('Error discovering Librarian service:', error instanceof Error ? error.message : String(error));
            // Use default as fallback
            this.librarianUrl = 'librarian:5040';
            console.log(`Using default Librarian URL after error: ${this.librarianUrl}`);
        }
    }

    /**
     * Sync performance data to Librarian
     */
    private async syncPerformanceDataToLibrarian() {
        try {
            // If we don't have a Librarian URL yet, try to discover it
            if (!this.librarianUrl) {
                await this.discoverLibrarianService();
                if (!this.librarianUrl) {
                    console.error('Cannot sync performance data: Librarian service not found');
                    return;
                }
            }

            console.log('Syncing model performance data to Librarian...');

            // Get performance data
            const performanceData = this.modelManager.performanceTracker.getAllPerformanceData();

            // Get rankings for different conversation types and metrics
            const conversationTypes = ['text/text', 'text/code', 'image/text'];
            const metrics = ['successRate', 'averageLatency', 'overall'];

            const rankings: Record<string, Record<string, any[]>> = {};

            for (const conversationType of conversationTypes) {
                rankings[conversationType] = {};
                for (const metric of metrics) {
                    rankings[conversationType][metric] = this.modelManager.getModelRankings(
                        conversationType,
                        metric as 'successRate' | 'averageLatency' | 'overall'
                    );
                }
            }

            // Prepare data for Librarian
            const modelPerformanceData = {
                performanceData,
                rankings,
                timestamp: new Date().toISOString()
            };

            // Store in Librarian using authenticatedApi to ensure proper authorization
            try {
                const response = await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                    id: 'model-performance-data',
                    data: modelPerformanceData,
                    storageType: 'mongo',
                    collection: 'mcsdata'
                });

                if (response.status === 200) {
                    console.log('Successfully synced model performance data to Librarian');
                } else {
                    console.error('Failed to sync model performance data to Librarian:', response.data);
                }
            } catch (apiError) {
                console.error('API error syncing performance data to Librarian:',
                    apiError instanceof Error ? apiError.message : String(apiError));
            }
        } catch (error) {
            console.error('Error syncing performance data to Librarian:', error instanceof Error ? error.message : String(error));
        }
    }
}

// Create an instance of the Brain
new Brain();
