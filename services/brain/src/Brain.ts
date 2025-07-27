import express from 'express';
import bodyParser from 'body-parser';
import { OptimizationType, ModelManager, modelManagerInstance } from './utils/modelManager';
import { LLMConversationType } from '@cktmcs/shared';
import { ExchangeType } from './services/baseService';
import { BaseEntity } from '@cktmcs/shared';
import dotenv from 'dotenv';
import { analyzeError } from '@cktmcs/errorhandler';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

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
        this.modelManager = modelManagerInstance;

        // Override the triggerImmediateDatabaseSync method to trigger immediate sync
        this.modelManager.triggerImmediateDatabaseSync = () => {
            console.log('[Brain] Immediate database sync triggered by blacklist change');
            this.syncPerformanceDataToLibrarian();
        };

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
        const maxRetries = 3;
        const modelName = req.body.modelName;
        const optimization = req.body.optimization;
        const conversationType = req.body.conversationType;
        const convertParams = req.body.convertParams;

        let attempt = 0;
        let lastError: string = '';

        while (attempt < maxRetries) {
            attempt++;
            let selectedModel: any = null;
            let trackingRequestId: string = '';

            try {
                // Select model for this attempt
                selectedModel = modelName && attempt === 1 ?
                    this.modelManager.getModel(modelName) :
                    this.modelManager.selectModel(optimization, conversationType);

                if (!selectedModel || !selectedModel.isAvailable() || !selectedModel.service) {
                    if (attempt === 1) {
                        console.log(`[Brain Generate] No suitable model found on attempt ${attempt}`);
                        lastError = 'No suitable model found';
                        continue;
                    } else {
                        break; // No more models available
                    }
                }

                // Prepare parameters for this model
                const modelConvertParams = { ...convertParams };
                modelConvertParams.max_length = modelConvertParams.max_length ?
                    Math.min(modelConvertParams.max_length, selectedModel.tokenLimit) :
                    selectedModel.tokenLimit;

                // Track the model request
                const prompt = JSON.stringify(modelConvertParams);
                trackingRequestId = this.modelManager.trackModelRequest(selectedModel.name, conversationType, prompt);

                this.llmCalls++;
                console.log(`[Brain Generate] Attempt ${attempt}: Using model ${selectedModel.modelName}-${conversationType}`);

                const result = await selectedModel.llminterface?.convert(selectedModel.service, conversationType, modelConvertParams);

                // Track successful response
                this.modelManager.trackModelResponse(trackingRequestId, result || '', 0, true);

                res.json({ response: result, mimeType: 'text/plain' });
                return; // Success!

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                lastError = errorMessage;
                console.error(`[Brain Generate] Attempt ${attempt} failed with model ${selectedModel?.modelName || 'unknown'}: ${errorMessage}`);

                // Track failed response
                if (selectedModel && trackingRequestId) {
                    console.log(`[Brain Generate] Tracking failure for model ${selectedModel.name}`);
                    this.modelManager.trackModelResponse(trackingRequestId, '', 0, false, errorMessage);
                }

                // Continue to next attempt unless this was the last one
                if (attempt < maxRetries) {
                    console.log(`[Brain Generate] Attempting retry ${attempt + 1}/${maxRetries}`);
                }
            }
        }

        // All attempts failed
        console.error(`[Brain Generate] All ${maxRetries} attempts failed. Last error: ${lastError}`);
        res.status(500).json({ error: `All model attempts failed. Last error: ${lastError}` });
    }

    async chat(req: express.Request, res: express.Response) {
        const requestId = uuidv4();
        console.log(`[Brain Chat] Request ${requestId} received`);

        const maxRetries = 3;
        const thread = this.createThreadFromRequest(req);

        let attempt = 0;
        let lastError: string = '';

        while (attempt < maxRetries) {
            attempt++;
            let selectedModel: any = null;
            let trackingRequestId: string = '';

            try {
                // Select model for this attempt
                selectedModel = this.modelManager.selectModel(
                    thread.optimization || 'accuracy',
                    thread.conversationType || LLMConversationType.TextToText
                );

                if (!selectedModel || !selectedModel.isAvailable()) {
                    lastError = `No suitable model found for ${thread.optimization}/${thread.conversationType}`;
                    console.log(`[Brain Chat] Attempt ${attempt}: ${lastError}`);
                    if (attempt === maxRetries) {
                        break; // No more attempts, will return error
                    }
                    continue;
                }

                console.log(`[Brain Chat] Attempt ${attempt}: Using model ${selectedModel.modelName}`);

                // Track the model request
                const prompt = thread.exchanges.map((e: any) => e.content).join(' ');
                trackingRequestId = this.modelManager.trackModelRequest(selectedModel.name, thread.conversationType || LLMConversationType.TextToText, prompt);

                await this._chatWithModel(selectedModel, thread, res, trackingRequestId);
                return; // Success!

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                lastError = errorMessage;
                console.error(`[Brain Chat] Attempt ${attempt} failed with model ${selectedModel?.modelName || 'unknown'}: ${errorMessage}`);

                // Track failed response
                if (selectedModel && trackingRequestId) {
                    console.log(`[Brain Chat] Tracking failure for model ${selectedModel.name}`);
                    this.modelManager.trackModelResponse(trackingRequestId, '', 0, false, errorMessage);
                }

                // Continue to next attempt unless this was the last one
                if (attempt < maxRetries) {
                    console.log(`[Brain Chat] Attempting retry ${attempt + 1}/${maxRetries}`);
                }
            }
        }

        // All attempts failed
        console.error(`[Brain Chat] All ${maxRetries} attempts failed. Last error: ${lastError}`);
        res.status(500).json({ error: `All model attempts failed. Last error: ${lastError}` });
    }

    private async _chatWithModel(selectedModel: any, thread: any, res: express.Response, requestId: string): Promise<void> {
        this.llmCalls++;
        console.log(`[Brain Chat] Using model ${selectedModel.modelName} for request ${requestId}`);

        const modelResponse = await selectedModel.llminterface.chat(
            selectedModel.service,
            thread.exchanges,
            {
                max_length: thread.max_length || selectedModel.tokenLimit,
                temperature: thread.temperature || 0.7,
                modelName: selectedModel.modelName
            }
        );

        if (!modelResponse || modelResponse === 'No response generated' ||
            (typeof modelResponse === 'string' && modelResponse.startsWith('Error:'))) {
            throw new Error(modelResponse || 'Model returned empty response');
        }

        // Track successful response with token count if available
        let tokenCount = 0;
        if (typeof modelResponse === 'object' && modelResponse && 'usage' in modelResponse) {
            tokenCount = (modelResponse as any).usage?.total_tokens || 0;
        }
        this.modelManager.trackModelResponse(requestId, typeof modelResponse === 'string' ? modelResponse : JSON.stringify(modelResponse), tokenCount, true);

        // AWARENESS IMPLEMENTATION: Add confidence score to response
        let confidence = 0.9; // Default confidence
        let finalResponse = modelResponse;
        if (typeof modelResponse === 'object' && modelResponse && 'confidence' in modelResponse) {
            confidence = (modelResponse as any).confidence;
            finalResponse = (modelResponse as any).result || modelResponse;
        }

        res.json({
            response: finalResponse,
            confidence: confidence,
            model: selectedModel.modelName,
            requestId: requestId
        });
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
                    console.log('[determineMimeType] Detected valid JSON response, setting MIME type to application/json');
                    return 'application/json';
                } catch (parseError) {
                    console.log('[determineMimeType] Response looks like JSON but failed to parse:', parseError instanceof Error ? parseError.message : String(parseError));
                    // Continue to check for code blocks
                }
            }
        } catch (e) {
            // Not valid JSON, continue with text/plain
            console.log('[determineMimeType] Response is not valid JSON, using text/plain');
        }

        // Log the first 100 characters of the response for debugging
        console.log(`[determineMimeType] Response preview (first 100 chars): ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`);

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
            const conversationTypes = [LLMConversationType.TextToText, LLMConversationType.TextToCode, LLMConversationType.ImageToText];
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
            console.warn('[Brain] Cannot restore performance data: Librarian service not found, using default model scores');
            return;
        }

        try {
            console.log('[Brain] Attempting to restore model performance data from Librarian...');

            // Add timeout and retry logic for Librarian connection
            const response = await Promise.race([
                this.authenticatedApi.get(`http://${this.librarianUrl}/loadData/model-performance-data`, {
                    params: { collection: 'mcsdata', storageType: 'mongo' }
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Librarian connection timeout')), 5000)
                )
            ]);

            if (response && response.data && response.data.data && response.data.data.performanceData) {
                const perfData = response.data.data.performanceData;
                if (Array.isArray(perfData) && perfData.length > 0) {
                    this.modelManager.performanceTracker.setAllPerformanceData(perfData);
                    console.log(`[Brain] Successfully restored ${perfData.length} model performance records from Librarian`);
                } else {
                    console.log('[Brain] No valid performance data found in Librarian response, using default scores');
                }
            } else {
                console.log('[Brain] No existing performance data found in Librarian, starting with default scores');
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.warn(`[Brain] Could not restore performance data from Librarian (${errorMessage}), continuing with default model scores`);
            // Continue without performance data - the system will work with default scores
            // This is not a critical error, just means we start fresh
        }
    }

    private createThreadFromRequest(req: express.Request): Thread {
        const body = req.body;
        
        return {
            exchanges: body.exchanges || [],
            optimization: body.optimization || 'accuracy',
            conversationType: body.ConversationType || body.conversationType || LLMConversationType.TextToText,
            optionals: {
                max_length: body.max_length,
                temperature: body.temperature,
                ...body.optionals
            }
        };
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
