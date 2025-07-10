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

        this.init();

        // On startup, restore metrics from Librarian
        this.restorePerformanceDataFromLibrarian().then(() => {
            // Start periodic sync of performance data to Librarian
            this.setupPerformanceDataSync();
        });
    }

    init() {
        // Middleware
        app.use(bodyParser.json());

        // Use the BaseEntity verifyToken method for authentication
        app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
            // Skip authentication for health endpoint, chat endpoint, and feedback endpoint
            if (req.path === '/health' || req.path === '/chat' || req.path === '/feedback') {
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
                console.error('Error resetting blacklisted models:', error instanceof Error ? error.message : String(error));
                res.status(500).json({ error: 'Failed to reset blacklisted models' });
            }
        });

        // API endpoint for receiving feedback on model performance
        app.post('/feedback', async (req: express.Request, res: express.Response) => {
            try {
                await this.handleFeedback(req, res);
            } catch (error) {
                console.error('Error handling feedback:', error instanceof Error ? error.message : String(error));
                res.status(500).json({ error: 'Failed to process feedback' });
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

            // If a specific model is requested, use it directly (no retry)
            if (req.body.model) {
                const selectedModel = this.modelManager.getModel(req.body.model);
                if (!selectedModel) {
                    res.json({ response: 'No suitable model found.', mimeType: 'text/plain' });
                    console.log('No suitable model found for chat.');
                    return;
                }
                await this._chatWithModel(selectedModel, thread, res);
                return;
            }

            // Otherwise, use retry logic with selectModel
            let lastError = null;
            let attempts = 0;
            const maxAttempts = 8; // Increased attempts
            const triedModels = new Set<string>();

            // Try different optimization strategies if the primary one fails
            const fallbackOptimizations = ['accuracy', 'speed', 'creativity', 'cost'];
            const fallbackConversationTypes = [thread.conversationType, 'text/text', 'text/code'];

            while (attempts < maxAttempts) {
                // Use fallback optimization and conversation type after initial attempts
                const currentOptimization = attempts < 3 ? thread.optimization : fallbackOptimizations[attempts % fallbackOptimizations.length];
                const currentConversationType = attempts < 2 ? thread.conversationType : fallbackConversationTypes[attempts % fallbackConversationTypes.length];

                const selectedModel = this.modelManager.selectModel(currentOptimization, currentConversationType);
                if (!selectedModel) {
                    console.log(`No model found for ${currentOptimization}/${currentConversationType}, trying next combination...`);
                    attempts++;
                    continue;
                }

                const modelKey = `${selectedModel.modelName}-${currentConversationType}`;
                if (triedModels.has(modelKey)) {
                    // Skip already tried model/conversation type combinations
                    attempts++;
                    continue;
                }
                triedModels.add(modelKey);

                // Track the request for this attempt
                const messages = thread.exchanges;
                this.llmCalls++; // Increment for every attempt
                const requestId = this.modelManager.trackModelRequest(selectedModel.name, currentConversationType, JSON.stringify(messages));

                try {
                    console.log(`[Brain Chat] Attempt ${attempts + 1}: Using model ${selectedModel.modelName} with ${currentOptimization}/${currentConversationType}`);

                    // Update thread for this attempt
                    const attemptThread = {
                        ...thread,
                        optimization: currentOptimization,
                        conversationType: currentConversationType
                    };

                    await this._chatWithModel(selectedModel, attemptThread, res, requestId);
                    return; // Success, exit
                } catch (error) {
                    lastError = error instanceof Error ? error.message : String(error);
                    console.log(`[Brain Chat] Model ${selectedModel.modelName} failed: ${lastError}`);

                    // Log the failed attempt as a retry
                    this.modelManager.trackModelResponse(
                        requestId,
                        '',
                        0,
                        false,
                        lastError,
                        true // isRetry
                    );

                    // Shorter blacklist for temporary failures, longer for persistent ones
                    const blacklistDuration = lastError.includes('404') || lastError.includes('Connection') ?
                        30 * 60 * 1000 : // 30 minutes for connection/404 errors
                        5 * 60 * 1000;   // 5 minutes for other errors

                    const blacklistUntil = new Date(Date.now() + blacklistDuration);
                    this.modelManager.blacklistModel(selectedModel.modelName, blacklistUntil);
                    console.log(`[Brain Chat] Blacklisted model ${selectedModel.modelName} for ${blacklistDuration/60000} minutes due to: ${lastError}`);
                    attempts++;
                }
            }
            // If we reach here, all attempts failed
            console.log(`[Brain Chat] All ${maxAttempts} attempts failed. Last error: ${lastError}`);
            res.status(500).json({ error: lastError || 'No suitable model found after retries.' });
        } catch (error) {
            console.log('Chat Error in Brain:', error instanceof Error ? error.message : String(error));
            analyzeError(error as Error);
            res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
        }
    }

    /**
     * Helper to handle chatting with a specific model, including tracking and response logic.
     * Throws on error so retry logic can handle it.
     */
    private async _chatWithModel(selectedModel: any, thread: any, res: express.Response, requestId?: string) {
        console.log(`Chatting with model ${selectedModel.modelName} using interface ${selectedModel.interfaceName} and conversation type ${thread.conversationType}`);

        // Extract only the message content from the exchanges
        const messages = thread.exchanges;
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

        // Use provided requestId or create if missing (for direct model call)
        const reqId = requestId || this.modelManager.trackModelRequest(selectedModel.name, thread.conversationType, JSON.stringify(messages));
        try {
            // Pass optionals to the model, including response_format if specified
            console.log(`Brain: Passing optionals to model: ${JSON.stringify(thread.optionals)}`);
            let modelResponse = await selectedModel.chat(messages, thread.optionals || {});
            console.log(`[Brain Chat] Model response received:`, modelResponse);

            // --- JSON extraction and validation ---
            // If the conversation type is text/code or the prompt requests JSON, ensure JSON response
            let requireJson = false;
            if (thread.conversationType === LLMConversationType.TextToCode) requireJson = true;
            if (messages && messages.length > 0 && messages[0].content &&
                (messages[0].content.includes('JSON') || messages[0].content.includes('json'))) {
                requireJson = true;
            }
            if (requireJson && selectedModel.llminterface && typeof selectedModel.llminterface.ensureJsonResponse === 'function') {
                modelResponse = selectedModel.llminterface.ensureJsonResponse(modelResponse, true);
            }

            // Track successful response
            // Estimate token count: ~4 chars per token is a rough approximation
            const estimatedTokenCount = typeof modelResponse === 'string'
                ? Math.ceil(modelResponse.length / 4)
                : 0;
            console.log(`[Brain] Estimated token count for response: ${estimatedTokenCount}`);

            this.modelManager.trackModelResponse(
                reqId,
                modelResponse,
                estimatedTokenCount,
                true,
                undefined, // error
                false // isRetry
            );

            if (!modelResponse || modelResponse == 'No response generated') {
                // Return a simple error response
                console.log(`No response generated by model ${selectedModel.modelName}`);
                res.status(500).json({ error: 'No response generated' });
                throw new Error('No response generated');
            }

            const mimeType = this.determineMimeType(modelResponse);
            res.json({
                response: modelResponse,
                mimeType: mimeType
            });
        } catch (error) {
            this.modelManager.trackModelResponse(
                reqId,
                '',
                0,
                false,
                error instanceof Error ? error.message : String(error),
                false // isRetry
            );
            throw error;
        }
    }

    /**
     * Get a list of all available models.
     */
    getAvailableModels(): string[] {
        return this.modelManager.getAvailableModels();
    }

    /**
     * Handle feedback on model performance from plugins
     * @param req Request
     * @param res Response
     */
    private async handleFeedback(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { type, success, quality_score, plan_steps, attempt_number, error_type, feedback_scores } = req.body;

            console.log(`[Brain] Received feedback: type=${type}, success=${success}, quality=${quality_score}, attempts=${attempt_number}`);

            if (type === 'plan_generation_feedback') {
                // Find the most recent model request for this conversation
                // This is a simplified approach - in production you might want to track request IDs
                const activeRequests = this.modelManager.getActiveRequestsCount();

                if (feedback_scores && typeof feedback_scores === 'object') {
                    // Update model performance based on feedback
                    // We'll use a heuristic to identify the model that was used
                    const availableModels = this.getAvailableModels();

                    if (availableModels.length > 0) {
                        // For now, update the first available model's performance
                        // In a more sophisticated implementation, you'd track which model was actually used
                        const modelName = availableModels[0];

                        console.log(`[Brain] Updating performance feedback for model: ${modelName}`);
                        this.modelManager.updateModelPerformanceFromEvaluation(
                            modelName,
                            LLMConversationType.TextToCode, // Assume plan generation uses text/code conversation type
                            feedback_scores
                        );
                    }
                }

                res.json({
                    success: true,
                    message: 'Feedback received and processed',
                    feedback_type: type,
                    feedback_success: success
                });
            } else {
                res.status(400).json({ error: 'Unknown feedback type' });
            }
        } catch (error) {
            console.error('[Brain] Error processing feedback:', error instanceof Error ? error.message : String(error));
            res.status(500).json({ error: 'Failed to process feedback' });
        }
    }

    /**
     * Skip authentication for certain endpoints
     * @param req Request
     * @param res Response
     * @param next Next function
     */
    private skipAuth(req: express.Request, _res: express.Response, next: express.NextFunction): void {
        console.log('[Brain] Skipping authentication for endpoint:', req.path);
        next();
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
                    return;
                }
            }
            // Fall back to environment variable
            const envUrl = process.env.LIBRARIAN_URL || 'librarian:5040';
            if (envUrl) {
                this.librarianUrl = envUrl;
                return;
            }
        } catch (error) {
            console.error('Error discovering Librarian service:', error instanceof Error ? error.message : String(error));
            this.librarianUrl = 'librarian:5040';
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
                    console.error('[Brain] Cannot sync performance data: Librarian service not found');
                    return;
                }
            }

            // Get all models with name and contentConversation
            const allModels = Array.from(this.modelManager.getAllModels().values()).map(model => ({
                name: model.name,
                contentConversation: model.contentConversation
            }));

            // Get performance data for all models (including unused)
            const performanceData = this.modelManager.performanceTracker.getAllPerformanceData(allModels);

            // Check if we have any performance data to sync
            if (performanceData.length === 0) {

                // Check if we have any blacklisted models that should be in the performance data
                const blacklistedModels = this.modelManager.getBlacklistedModels();
                if (blacklistedModels.length > 0) {
                    console.log(`[Brain] Found ${blacklistedModels.length} blacklisted models but no performance data. This is inconsistent.`);
                    console.log('[Brain] Blacklisted models:', JSON.stringify(blacklistedModels, null, 2));
                }

                // Check active requests
                console.log(`[Brain] Current active model requests: ${this.modelManager.getActiveRequestsCount()}`);

                return;
            }

            // Get rankings for different conversation types and metrics
            const conversationTypes = ['text/text', 'text/code', 'image/text'];
            const metrics = ['successRate', 'averageLatency', 'overall'];

            const rankings: Record<string, Record<string, any[]>> = {};

            for (const conversationType of conversationTypes) {
                rankings[conversationType] = {};
                for (const metric of metrics) {
                    const modelRankings = this.modelManager.getModelRankings(
                        conversationType,
                        metric as 'successRate' | 'averageLatency' | 'overall'
                    );
                    rankings[conversationType][metric] = modelRankings;
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
                // After successful save, update in-memory tracker with latest data
                this.modelManager.performanceTracker.setAllPerformanceData(performanceData);
            } catch (apiError) {
                console.error('[Brain] API error syncing performance data to Librarian:',
                    apiError instanceof Error ? apiError.message : String(apiError));

                // Log more details about the error
                if (apiError instanceof Error && (apiError as any).response) {
                    const errorResponse = (apiError as any).response;
                    console.error(`[Brain] API error status: ${errorResponse.status}`);
                    console.error(`[Brain] API error data: ${JSON.stringify(errorResponse.data)}`);
                }
            }
        } catch (error) {
            console.error('[Brain] Error syncing performance data to Librarian:', error instanceof Error ? error.message : String(error));

            // Log the error but continue operation
            console.log('[Brain] Will retry syncing performance data on next scheduled interval');
        }
    }

    /**
     * Restore performance metrics from Librarian on startup
     */
    private async restorePerformanceDataFromLibrarian() {
        await this.discoverLibrarianService();
        if (!this.librarianUrl) {
            console.error('[Brain] Cannot restore performance data: Librarian service not found');
            return;
        }
        try {
            console.log('[Brain] Attempting to restore model performance data from Librarian...');
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData/model-performance-data`);
            if (response && response.data && response.data.data && response.data.data.performanceData) {
                const perfData = response.data.data.performanceData;
                if (Array.isArray(perfData)) {
                    this.modelManager.performanceTracker.setAllPerformanceData(perfData);
                    console.log(`[Brain] Restored ${perfData.length} model performance records from Librarian`);
                } else {
                    console.warn('[Brain] No valid performance data found in Librarian response');
                }
            } else {
                console.warn('[Brain] No performance data found in Librarian');
            }
        } catch (err) {
            console.error('[Brain] Error restoring performance data from Librarian:', err instanceof Error ? err.message : String(err));
        }
    }
}

// ---
// To debug ACCOMPLISH registration, add logging in your registry/manager code:
// Example:
// console.log('Registered verbs:', Object.keys(localRegistry));
// console.log('CapabilitiesManager verbs:', capabilitiesManager.listVerbs());
// ---
// Create an instance of the Brain
new Brain();
