import express from 'express';
import bodyParser from 'body-parser';
import { OptimizationType, ModelManager, modelManagerInstance } from './utils/modelManager';
import { LLMConversationType } from '@cktmcs/shared';
import { ExchangeType } from './services/baseService';
import { ConvertParamsType } from './interfaces/baseInterface';
import { BaseEntity } from '@cktmcs/shared';
import dotenv from 'dotenv';
import { analyzeError } from '@cktmcs/errorhandler';
import { v4 as uuidv4 } from 'uuid';
import { redisCache } from '@cktmcs/shared';
import crypto from 'crypto';
dotenv.config();

interface Thread {
    exchanges: ExchangeType;
    optimization?: OptimizationType;
    optionals?: Record<string, any>;
    conversationType?: LLMConversationType;
    responseType?: string;
}

const app = express();
const port = process.env.PORT || 5070;

export class Brain extends BaseEntity {
    private modelManager: ModelManager;
    private llmCalls: number = 0;
    private activeLLMCalls: number = 0;
    private modelFailureCounts: { 
        [key: string]: { 
            timeout: number;
            json: number;
            other: number;
        } 
    } = {};

    private librarianUrl: string | null = null;
    private performanceDataSyncInterval: NodeJS.Timeout | null = null;
    private enrichmentCache: Map<string, any> = new Map<string, any>;

    constructor() {
        super('Brain', 'Brain', `brain`, process.env.PORT || '5020');
        this.modelManager = modelManagerInstance;

        (async () => {
            try {
                await redisCache.connect();
            } catch (error) {
                console.error(`[Brain] Failed to connect to Redis on startup:`, error);
            }
        })();

        this.modelManager.triggerImmediateDatabaseSync = () => {
            console.log('[Brain] Immediate database sync triggered by blacklist change');
            this.syncPerformanceDataToLibrarian();
        };

        this.init();

        this.restorePerformanceDataFromLibrarian().then(() => {
            this.setupPerformanceDataSync();
        });
    }

    init() {
        app.use(bodyParser.json({limit: '15mb'}));

        // Use BaseEntity's verifyToken method which already handles health check bypassing
        app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
            // Allow admin endpoints, chat, feedback, and reportLogicFailure without authentication
            if (req.path === '/chat' || req.path === '/feedback' || req.path === '/reportLogicFailure' || req.path.startsWith('/admin/')) {
                return next();
            }
            // BaseEntity.verifyToken already handles health check endpoints
            this.verifyToken(req, res, next);
        });

        app.get('/health', (_req: express.Request, res: express.Response) => {
            res.json({ status: 'ok', message: 'Brain service is running' });
        });

        app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
            console.error('Express error in Brain:', err instanceof Error ? err.message : String(err));
            analyzeError(err as Error);
            res.status(501).json({ error: 'Internal server error' });
        });

        app.post('/chat', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                await this.chat(req, res);
            } catch (error) {
                next(error);
            }
        });

        app.post('/generate', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                await this.generate(req, res);
            } catch (error) {
                next(error);
            }
        });

        app.post('/reportLogicFailure', async (req: express.Request, res: express.Response) => {
            try {
                const { requestId, reason } = req.body;

                if (!requestId) {
                    res.status(400).json({ error: 'Missing requestId' });
                    return;
                }

                console.log(`[Brain] Received logic failure report for request ${requestId}: ${reason || 'No reason provided'}`);

                // Get the request from the model manager to find which model was used
                const request = this.modelManager.getActiveRequest(requestId);
                if (request) {
                    console.log(`[Brain] Tracking logic failure for model ${request.modelName}, conversation type ${request.conversationType}`);
                    this.modelManager.trackLogicFailure(request.modelName, request.conversationType);
                    res.json({ success: true, message: 'Logic failure recorded' });
                } else {
                    console.warn(`[Brain] No active request found for ${requestId}, cannot track logic failure`);
                    res.status(404).json({ error: 'Request not found' });
                }
            } catch (error) {
                console.error('[Brain] Error handling logic failure report:', error);
                res.status(500).json({ error: 'Failed to record logic failure' });
            }
        });

        app.get('/getLLMCalls', (_req: express.Request, res: express.Response) => {
            res.json({ llmCalls: this.llmCalls, activeLLMCalls: this.activeLLMCalls});
        });

        app.get('/models', (_req: express.Request, res: express.Response) => {
            const models = this.getAvailableModels();
            res.json({ models });
        });

        app.post('/performance/reset-blacklists', (_req: express.Request, res: express.Response) => {
            try {
                this.modelManager.resetAllBlacklists();
                res.json({ success: true, message: 'All blacklisted models have been reset' });
            } catch (error) {
                console.error('Error resetting blacklisted models:', error instanceof Error ? error.message : String(error));
                res.status(500).json({ error: 'Failed to reset blacklisted models' });
            }
        });

        app.post('/feedback', async (req: express.Request, res: express.Response) => {
            try {
                await this.handleFeedback(req, res);
            } catch (error) {
                console.error('Error handling feedback:', error instanceof Error ? error.message : String(error));
                res.status(500).json({ error: 'Failed to process feedback' });
            }
        });

        app.listen(Number(port), '0.0.0.0', () => {
            console.log(`Brain service listening at http://0.0.0.0:${port}`);
        });

        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            analyzeError(error);
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            if (reason instanceof Error) {
                analyzeError(reason);
            }
        });
    }

    private modelTimeoutCounts: Record<string, number> = {};

    async generate(req: express.Request, res: express.Response) {
        // No retry limit - keep trying until we find a working model
        const modelNameRequest = req.body.modelName; // Requested model name from the agent
        const optimization = req.body.optimization || 'accuracy';
        const conversationType = req.body.type || req.body.conversationType || LLMConversationType.TextToText; // Use 'type' from agent request if present
        const promptFromAgent = req.body.prompt;
        const contentType = req.body.contentType || this.determineMimeType(promptFromAgent); // Ensure contentType is present

        console.log(`[Brain Generate] Request params - modelName: ${modelNameRequest || 'none'}, optimization: ${optimization}, conversationType: ${conversationType}, contentType: ${contentType}`);

        let attempt = 0;
        let lastError: string = '';
        let lastModelName: string | null = null;

        // Maintain an excluded models list so we don't retry the same failing provider
        const excludedModels: string[] = [];

        while (true) { // Infinite retry until success or no models available
            attempt++;
            let selectedModel: any = null;
            let trackingRequestId: string = '';

            try {
                selectedModel = modelNameRequest && attempt === 1 ?
                    this.modelManager.getModel(modelNameRequest) :
                    this.modelManager.selectModel(optimization, conversationType, excludedModels);

                // If selection failed, attempt a safer fallback: use any available, not-blacklisted model
                // that hasn't been excluded yet. This prevents quitting prematurely when strict
                // selection constraints filter out all models.
                if (!selectedModel) {
                    const fallbackModels = this.modelManager.getAvailableAndNotBlacklistedModels(conversationType)
                        .filter(m => !excludedModels.includes(m.name));
                    if (fallbackModels.length > 0) {
                        console.log(`[Brain Generate] selectModel returned null; falling back to first available model: ${fallbackModels[0].name}`);
                        selectedModel = fallbackModels[0];
                    }
                }

                if (!selectedModel || !selectedModel.isAvailable() || !selectedModel.service) {
                    if (attempt === 1) {
                        console.log(`[Brain Generate] No suitable model found on attempt ${attempt}`);
                        lastError = 'No suitable model found';
                        continue;
                    } else {
                        break;
                    }
                }

                lastModelName = selectedModel.name;

                // Construct ConvertParamsType object explicitly
                const modelConvertParams: ConvertParamsType = {
                    prompt: promptFromAgent,
                    contentType: contentType, // Now guaranteed to be present
                    modelName: selectedModel.modelName, // Use the selected model's actual name
                    // Pass through other relevant fields from req.body
                    file: req.body.file,
                    audio: req.body.audio,
                    video: req.body.video,
                    image: req.body.image,
                    trace_id: req.body.trace_id,
                    ...this.filterInternalParameters(req.body) // Include other filtered optional parameters
                };

                // Apply max_length after other parameters for correct min calculation
                modelConvertParams.max_length = selectedModel.tokenLimit || modelConvertParams.max_length ?
                    Math.min(modelConvertParams.max_length || selectedModel.tokenLimit, 8192) : 8192;

                const requestTrackingPrompt = modelConvertParams.prompt || ''; // Use the actual prompt for tracking
                trackingRequestId = this.modelManager.trackModelRequest(selectedModel.name, conversationType, requestTrackingPrompt);

                this.llmCalls++;
                this.activeLLMCalls++;
                console.log(`[Brain Generate] Attempt ${attempt}: Using model ${selectedModel.modelName} for conversation type ${conversationType} with content type ${contentType}`);

                const result = await selectedModel.llminterface?.convert(selectedModel.service, conversationType, modelConvertParams);
                this.activeLLMCalls = Math.max(0, this.activeLLMCalls - 1);
                this.modelManager.trackModelResponse(trackingRequestId, result || '', 0, true);

                if (selectedModel.name in this.modelTimeoutCounts) {
                    this.modelTimeoutCounts[selectedModel.name] = 0;
                }

                res.json({ result: result, mimeType: contentType || 'text/plain' });
                return;

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                lastError = errorMessage;
                console.error(`[Brain Generate] Attempt ${attempt} failed with model ${selectedModel?.modelName || 'unknown'}: ${errorMessage}`);

                if (selectedModel && trackingRequestId) {
                    console.log(`[Brain Generate] Tracking failure for model ${selectedModel.name}`);
                    this.modelManager.trackModelResponse(trackingRequestId, '', 0, false, errorMessage);
                }

                if (selectedModel && selectedModel.name) {
                    const isTimeout = /timeout|system_error/i.test(errorMessage);
                    const isRateLimit = /rate limit|429/i.test(errorMessage);

                    if (isTimeout) {
                        this.modelTimeoutCounts[selectedModel.name] = (this.modelTimeoutCounts[selectedModel.name] || 0) + 1;
                        if (this.modelTimeoutCounts[selectedModel.name] >= 3) {
                            console.warn(`[Brain Generate] Blacklisting model ${selectedModel.name} after 3 consecutive timeouts/system errors.`);
                            this.modelManager.blacklistModel(selectedModel.name, new Date(Date.now() + 3600 * 1000), conversationType);
                            this.modelTimeoutCounts[selectedModel.name] = 0;
                        }
                    } else if (isRateLimit) {
                        // Handle rate limiting by notifying the service
                        console.warn(`[Brain Generate] Rate limit detected for model ${selectedModel.name}. Notifying service.`);
                        if (selectedModel.service && typeof selectedModel.service.handleRateLimitError === 'function') {
                            selectedModel.service.handleRateLimitError(error);
                        }
                        // Don't blacklist immediately for rate limits, let the service handle availability
                    } else {
                        this.modelTimeoutCounts[selectedModel.name] = 0;
                    }

                    // Exclude this model from further selection attempts for this request
                    try {
                        excludedModels.push(selectedModel.name);
                        console.log(`[Brain Generate] Excluding model ${selectedModel.name} from subsequent attempts`);
                    } catch (e) {
                        console.warn('[Brain Generate] Failed to exclude model from retries', e);
                    }
                }

                // Check if we have any available models left (not blacklisted/unavailable)
                const availableModels = this.modelManager.getAvailableAndNotBlacklistedModels(conversationType || LLMConversationType.TextToText);
                if (availableModels.length === 0) {
                    console.error(`[Brain Generate] No available models left after ${attempt} attempts. Last error: ${lastError}`);
                    res.status(500).json({ error: `No available models. Last error: ${lastError}` });
                    return;
                }

                const retryDelay = Math.min(Math.pow(2, Math.min(attempt, 10)) * 1000, 30000); // Cap at 30s
                console.log(`[Brain Generate] Attempting retry ${attempt + 1} in ${retryDelay / 1000}s (${availableModels.length} models available)`);
                // Clear selection cache to avoid repeated cached picks
                this.modelManager.clearModelSelectionCache();
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }

        // If the loop completes without sending a response, it means we failed to find a model.
        if (!res.headersSent) {
            console.error(`[Brain Generate] Failed to find a suitable model after all retries. Last error: ${lastError}`);
            res.status(503).json({
                error: `Service Unavailable: Could not find a suitable model to handle the request. Last error: ${lastError}`,
                model: lastModelName,
                requestId: req.body.requestId || null
            });
        }
    }

    async chat(req: express.Request, res: express.Response) {
        const requestId = uuidv4();
        console.log(`[Brain Chat] Request ${requestId} received`);

        const cacheKey = `brain-chat-${crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex')}`;
        try {
            const cachedResponse = await redisCache.get<any>(cacheKey);
            if (cachedResponse) {
                console.log(`[Brain Chat] Cache hit for request ${requestId}. Returning cached response.`);
                res.json(cachedResponse);
                return;
            }
        } catch (error) {
            analyzeError(error as Error);
        }

        console.log(`[Brain Chat] Cache miss for request ${requestId}. Proceeding with LLM call.`);
        // No retry limit - keep trying until we find a working model
        const thread = this.createThreadFromRequest(req);
        
        // Enrich context with relevant verbs and tools if goal is available
        const goal = (req.body.goal as string) || (thread.exchanges && thread.exchanges.length > 0 && thread.exchanges[0].content) || '';
        const context = req.body.context as string;
        const missionId = req.body.missionId as string;
        if (goal) {
            const enrichment = await this.enrichContextWithVerbsAndTools(goal, context, missionId);
            // Store enrichment in thread.optionals for later use
            if (!thread.optionals) thread.optionals = {};
            thread.optionals.contextEnrichment = enrichment;
        }

        // Estimate token count (heuristic: 1 token ~= 4 characters)
        const estimatedTokens = thread.exchanges.reduce((acc, ex) => acc + ex.content.length, 0) / 4;

        let attempt = 0;
        let lastError: string = '';
        let lastModelName: string | null = null;
        const excludedModels: string[] = [];

        while (true) { // Infinite retry until success or no models available
            attempt++;
            let selectedModel: any = null;
            let trackingRequestId: string = '';

            try {
                selectedModel = this.modelManager.selectModel(
                    thread.optimization || 'accuracy',
                    thread.conversationType || LLMConversationType.TextToText,
                    excludedModels,
                    estimatedTokens
                );

                // If no model was returned by selectModel, try a relaxed fallback selection
                if (!selectedModel) {
                    const fallbackModels = this.modelManager.getAvailableAndNotBlacklistedModels(thread.conversationType || LLMConversationType.TextToText)
                        .filter(m => !excludedModels.includes(m.name));
                    if (fallbackModels.length > 0) {
                        console.log(`[Brain Chat] selectModel returned null; falling back to first available model: ${fallbackModels[0].name}`);
                        selectedModel = fallbackModels[0];
                    }
                }

                if (!selectedModel) {
                    lastError = `No model could be selected for the specified criteria.`;
                    console.log(`[Brain Chat] Attempt ${attempt}: ${lastError}`);
                    break; 
                }

                if (!selectedModel.isAvailable()) {
                    lastError = `Model ${selectedModel.name} is not available`;
                    console.log(`[Brain Chat] Attempt ${attempt}: ${lastError}, excluding model.`);
                    excludedModels.push(selectedModel.name);
                    continue;
                }

                lastModelName = selectedModel.name;

                console.log(`[Brain Chat] Attempt ${attempt}: Using model ${selectedModel.modelName}`);

                const prompt = thread.exchanges.map((e: any) => e.content).join(' ');
                trackingRequestId = this.modelManager.trackModelRequest(selectedModel.name, thread.conversationType || LLMConversationType.TextToText, prompt);

                const response = await this._chatWithModel(selectedModel, thread, trackingRequestId);

                if (selectedModel.name in this.modelTimeoutCounts) {
                    this.modelTimeoutCounts[selectedModel.name] = 0;
                }
                
                try {
                    await redisCache.set(cacheKey, response, 3600); // Cache for 1 hour
                } catch (error) {
                    analyzeError(error as Error);
                }
                res.json(response);

                return;

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                lastError = errorMessage;
                console.error(`[Brain Chat] Attempt ${attempt} failed with model ${selectedModel?.modelName || 'unknown'}: ${errorMessage}`);

                if (selectedModel && trackingRequestId) {
                    console.log(`[Brain Chat] Tracking failure for model ${selectedModel.name}`);
                    this.modelManager.trackModelResponse(trackingRequestId, '', 0, false, errorMessage);
                }

                if (selectedModel && selectedModel.name && errorMessage.includes('max_tokens') && errorMessage.includes('context_window')) {
                    const currentMaxTokens = thread.optionals?.max_length || selectedModel.tokenLimit;
                    const newMaxTokens = Math.max(512, Math.floor(currentMaxTokens * 0.75)); // Reduce by 25%, minimum 512

                    if (newMaxTokens < currentMaxTokens) {
                        console.warn(`[Brain Chat] Model ${selectedModel.name} failed due to max_tokens. Retrying with reduced max_tokens from ${currentMaxTokens} to ${newMaxTokens}.`);
                        if (!thread.optionals) {
                            thread.optionals = {};
                        }
                        thread.optionals.max_length = newMaxTokens;
                        // Do NOT add to excludedModels, allow retry with smaller tokens
                    } else {
                        console.error(`[Brain Chat] Model ${selectedModel.name} failed due to max_tokens, but could not reduce further or already at minimum. Excluding it from retries.`);
                        excludedModels.push(selectedModel.name);
                    }
                } else if (selectedModel && selectedModel.name) {
                    const isTimeout = /timeout|system_error|connection error/i.test(errorMessage);
                    const isJsonError = /json|parse|invalid format/i.test(errorMessage);
                    const isRateLimit = /rate limit|429/i.test(errorMessage);

                    if (!this.modelFailureCounts[selectedModel.name]) {
                        this.modelFailureCounts[selectedModel.name] = { timeout: 0, json: 0, other: 0 };
                    }

                    if (isRateLimit) {
                        // Handle rate limiting by notifying the service
                        console.warn(`[Brain Chat] Rate limit detected for model ${selectedModel.name}. Notifying service.`);
                        if (selectedModel.service && typeof selectedModel.service.handleRateLimitError === 'function') {
                            selectedModel.service.handleRateLimitError(error);
                        }
                        // Don't count rate limits as failures, let the service handle availability
                    } else if (isTimeout) {
                        this.modelFailureCounts[selectedModel.name].timeout++;
                    } else if (isJsonError) {
                        this.modelFailureCounts[selectedModel.name].json++;
                    } else {
                        this.modelFailureCounts[selectedModel.name].other++;
                    }

                    const counts = this.modelFailureCounts[selectedModel.name];
                    const totalFailures = counts.timeout + counts.json + counts.other;
                    
                    // More aggressive blacklisting for specific, repeated failures
                    if (counts.timeout >= 2 || counts.json >= 3 || totalFailures >= 5) {
                        console.warn(`[Brain Chat] Blacklisting model ${selectedModel.name} due to repeated failures:`, `Timeouts: ${counts.timeout}, JSON errors: ${counts.json}, Other: ${counts.other}`);
                        this.modelManager.blacklistModel(selectedModel.name, new Date(Date.now() + 15 * 60 * 1000), thread.conversationType || null); // Blacklist for 15 minutes
                        // Reset counts after blacklisting
                        this.modelFailureCounts[selectedModel.name] = { timeout: 0, json: 0, other: 0 };
                    }
                }

                // Check if we have any available models left
                const availableModels = this.getAvailableModels();
                if (availableModels.length === 0) {
                    console.error(`[Brain Chat] No available models left after ${attempt} attempts. Last error: ${lastError}`);
                    res.status(500).json({ error: `No available models. Last error: ${lastError}` });
                    return;
                }

                const retryDelay = Math.min(Math.pow(2, Math.min(attempt, 10)) * 1000, 30000); // Cap at 30s
                console.log(`[Brain Chat] Clearing model selection cache and retrying in ${retryDelay / 1000}s... (${availableModels.length} models available)`);
                this.modelManager.clearModelSelectionCache();
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }

        // If the loop completes without sending a response, it means we failed to find a model.
        if (!res.headersSent) {
            console.error(`[Brain Chat] Failed to find a suitable model after all retries. Last error: ${lastError}`);
            res.status(503).json({
                error: `Service Unavailable: Could not find a suitable model to handle the request. Last error: ${lastError}`,
                model: lastModelName,
                requestId: requestId
            });
        }
    }

    private async _chatWithModel(selectedModel: any, thread: any, requestId: string): Promise<any> {
        this.llmCalls++;
        this.activeLLMCalls++;
        console.log(`[Brain Chat] Using model ${selectedModel.modelName} for request ${requestId}`);

        const filteredOptionals = this.filterInternalParameters(thread.optionals || {});

        let modelResponse;
        try {
            modelResponse = await selectedModel.llminterface.chat(
                selectedModel.service,
                thread.exchanges,
                {
                    max_length: thread.max_length || selectedModel.tokenLimit,
                    temperature: thread.temperature || 0.7,
                    modelName: selectedModel.modelName,
                    responseType: thread.responseType || 'text',
                    ...filteredOptionals
                }
            );
            this.activeLLMCalls = Math.max(0, this.activeLLMCalls - 1);
            if (!modelResponse || modelResponse === 'No response generated' ||
                (typeof modelResponse === 'string' && modelResponse.startsWith('Error:'))) {
                throw new Error(modelResponse || 'Model returned empty response');
            }

            let logicFailure = false;
            // For TextToJSON, ensure JSON validity and handle unrecoverable errors
            if (thread.conversationType === LLMConversationType.TextToJSON) {
                try {
                    // Use ensureJsonResponse to validate/repair
                    const jsonResponse = await selectedModel.llminterface.ensureJsonResponse(modelResponse, true, selectedModel.service);
                    if (jsonResponse) {
                        const parsed = JSON.parse(jsonResponse);
                        if (Object.keys(parsed).length === 0 || (Object.keys(parsed).length === 1 && parsed.content)) {
                            logicFailure = true;
                        }
                    } else {
                        logicFailure = true;
                    }
                } catch (jsonError) {
                    console.error(`[Brain Chat] Model ${selectedModel.name} failed to return valid JSON: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
                    // Before blacklisting, attempt an on-the-spot regeneration with a strict JSON-only system prompt.
                    try {
                        console.log(`[Brain Chat] Attempting regeneration with strict JSON enforcement for model ${selectedModel.name}`);

                        // Prepare a regeneration message list: ensure a system instruction to output only valid JSON
                        const regenExchanges = [{ role: 'system', content: 'You must respond with a single, valid JSON array (start with [ and end with ]). Do not include any explanation, markdown, or extra text.' }, ...thread.exchanges];

                        const regenResponse = await selectedModel.llminterface.chat(
                            selectedModel.service,
                            regenExchanges,
                            {
                                max_length: thread.max_length || selectedModel.tokenLimit,
                                temperature: 0.0,
                                modelName: selectedModel.modelName,
                                responseType: 'json'
                            }
                        );

                        // Try to validate/repair regen response using interface helper
                        const regenJson = await selectedModel.llminterface.ensureJsonResponse(regenResponse, true, selectedModel.service);
                        if (regenJson) {
                            const parsed = JSON.parse(regenJson);
                            if (Object.keys(parsed).length === 0 || (Object.keys(parsed).length === 1 && parsed.content)) {
                                // Consider as logic failure, will fall through to blacklist below
                                console.warn(`[Brain Chat] Regenerated JSON appears empty or invalid from model ${selectedModel.name}`);
                            } else {
                                // Successful regeneration — treat as valid response
                                modelResponse = regenJson;
                                console.log(`[Brain Chat] Regeneration succeeded for model ${selectedModel.name}`);
                                // Continue processing as if original response was valid
                            }
                        } else {
                            console.warn(`[Brain Chat] Regeneration produced no valid JSON for model ${selectedModel.name}`);
                        }
                    } catch (regenErr) {
                        console.warn(`[Brain Chat] Regeneration attempt failed for model ${selectedModel.name}: ${regenErr instanceof Error ? regenErr.message : String(regenErr)}`);
                    }
                }

                // If regeneration didn't produce a usable JSON, blacklist and throw to trigger retry
                try {
                    // If modelResponse was replaced by a successful regenJson above, do not blacklist
                    if (!modelResponse || (typeof modelResponse === 'string' && modelResponse.trim().length === 0)) {
                        console.error(`[Brain Chat] Unrecoverable JSON from model ${selectedModel.name}, blacklisting.`);
                        this.modelManager.blacklistModel(selectedModel.name, new Date(), thread.conversationType);
                        throw new Error('Unrecoverable JSON from model: ' + selectedModel.name);
                    }
                } catch (finalErr) {
                    throw finalErr;
                }
            }

            let tokenCount = 0;
            if (typeof modelResponse === 'object' && modelResponse && 'usage' in modelResponse) {
                tokenCount = (modelResponse as any).usage?.total_tokens || 0;
            }
            this.modelManager.trackModelResponse(requestId, typeof modelResponse === 'string' ? modelResponse : JSON.stringify(modelResponse), tokenCount, true, undefined, undefined, logicFailure);

            let confidence = 0.9;
            let finalResponse = modelResponse;
            if (typeof modelResponse === 'object' && modelResponse && 'confidence' in modelResponse) {
                confidence = (modelResponse as any).confidence;
                finalResponse = (modelResponse as any).result || modelResponse;
            }

            return {
                result: finalResponse,
                confidence: confidence,
                model: selectedModel.modelName,
                requestId: requestId
            };
        } catch (err) {
            this.activeLLMCalls = Math.max(0, this.activeLLMCalls - 1);
            throw err;
        }
    }

    getAvailableModels(): string[] {
        return this.modelManager.getAvailableModels();
    }

    private async handleFeedback(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { type, success, quality_score, plan_steps, attempt_number, error_type, feedback_scores } = req.body;

            console.log(`[Brain] Received feedback: type=${type}, success=${success}, quality=${quality_score}, attempts=${attempt_number}`);

            if (type === 'plan_generation_feedback') {
                const activeRequests = this.modelManager.getActiveRequestsCount();

                if (feedback_scores && typeof feedback_scores === 'object') {
                    const availableModels = this.getAvailableModels();

                    if (availableModels.length > 0) {
                        const modelName = availableModels[0];

                        console.log(`[Brain] Updating performance feedback for model: ${modelName}`);
                        this.modelManager.updateModelPerformanceFromEvaluation(
                            modelName,
                            LLMConversationType.TextToCode,
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

    private determineMimeType(response: string): string {
        if (!response || typeof response !== 'string') {
            console.log('Invalid response type in determineMimeType:', typeof response);
            return 'text/plain';
        }

        if (response.startsWith('<html>')) {
            return 'text/html';
        }

        try {
            const trimmed = response.trim();
            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                try {
                    JSON.parse(trimmed);
                    console.log('[determineMimeType] Detected valid JSON response, setting MIME type to application/json');
                    return 'application/json';
                } catch (parseError) {
                    console.log('[determineMimeType] Response looks like JSON but failed to parse:', parseError instanceof Error ? parseError.message : String(parseError));
                }
            }
        } catch (e) {
            console.log('[determineMimeType] Response is not valid JSON, using text/plain');
        }

        console.log(`[determineMimeType] Response preview (first 100 chars): ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`);

        return 'text/plain';
    }

    private setupPerformanceDataSync() {
        this.discoverLibrarianService();

        this.performanceDataSyncInterval = setInterval(() => {
            this.syncPerformanceDataToLibrarian();
        }, 5 * 60 * 1000);

        setTimeout(() => {
            this.syncPerformanceDataToLibrarian();
        }, 10000);
    }

    private async discoverLibrarianService() {
        try {
            if (this.serviceDiscovery) {
                const url = await this.serviceDiscovery.discoverService('Librarian');
                if (url) {
                    this.librarianUrl = url;
                    return;
                }
            }
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

    private async syncPerformanceDataToLibrarian() {
        try {
            if (!this.librarianUrl) {
                await this.discoverLibrarianService();
                if (!this.librarianUrl) {
                    console.error('[Brain] Cannot sync performance data: Librarian service not found');
                    return;
                }
            }

            const allModels = Array.from(this.modelManager.getAllModels().values()).map(model => ({
                name: model.name,
                contentConversation: model.contentConversation
            }));

            const performanceData = this.modelManager.performanceTracker.getAllPerformanceData(allModels);

            if (performanceData.length === 0) {
                const blacklistedModels = this.modelManager.getBlacklistedModels();
                if (blacklistedModels.length > 0) {
                    console.log(`[Brain] Found ${blacklistedModels.length} blacklisted models but no performance data. This is inconsistent.`);
                    console.log('[Brain] Blacklisted models:', JSON.stringify(blacklistedModels, null, 2));
                }

                console.log(`[Brain] Current active model requests: ${this.modelManager.getActiveRequestsCount()}`);

                return;
            }

            const conversationTypes = [LLMConversationType.TextToText, LLMConversationType.TextToCode, LLMConversationType.ImageToText, LLMConversationType.TextToJSON];
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

            const modelPerformanceData = {
                performanceData,
                rankings,
                timestamp: new Date().toISOString()
            };

            try {
                const response = await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                    id: 'model-performance-data',
                    data: modelPerformanceData,
                    storageType: 'mongo',
                    collection: 'mcsdata'
                });
                this.modelManager.performanceTracker.setAllPerformanceData(performanceData);
            } catch (apiError) {
                console.error('[Brain] API error syncing performance data to Librarian:',
                    apiError instanceof Error ? apiError.message : String(apiError));

                if (apiError instanceof Error && (apiError as any).response) {
                    const errorResponse = (apiError as any).response;
                    console.error(`[Brain] API error status: ${errorResponse.status}`);
                    console.error(`[Brain] API error data: ${JSON.stringify(errorResponse.data)}`);
                }
            }
        } catch (error) {
            console.error('[Brain] Error syncing performance data to Librarian:', error instanceof Error ? error.message : String(error));
            console.log('[Brain] Will retry syncing performance data on next scheduled interval');
        }
    }

    private async restorePerformanceDataFromLibrarian() {
        await this.discoverLibrarianService();
        if (!this.librarianUrl) {
            console.warn('[Brain] Cannot restore performance data: Librarian service not found, using default model scores');
            return;
        }

        try {
            console.log('[Brain] Attempting to restore model performance data from Librarian...');

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
        }
    }

    private createThreadFromRequest(req: express.Request): Thread {
        const body = req.body;

        const thread: Thread = {
            exchanges: body.exchanges || body.messages || [],
            optimization: body.optimization || 'accuracy',
            conversationType: body.ConversationType || body.conversationType || LLMConversationType.TextToText,
            optionals: {
                max_length: body.max_length,
                temperature: body.temperature,
                ...body.optionals
            },
            // Determine responseType explicitly: prefer provided `responseType`,
            // otherwise derive from conversationType. Parentheses are important
            // to avoid coerced truthy evaluation causing incorrect JSON selection.
            responseType: (typeof body.responseType === 'string' && body.responseType.length > 0)
                ? body.responseType
                : (body.conversationType === LLMConversationType.TextToJSON ? 'json' : 'text')
        };

        console.log('[Brain Debug] Final thread object:', JSON.stringify({
            optimization: thread.optimization,
            conversationType: thread.conversationType,
            responseType: thread.responseType
        }, null, 2));

        const requiresJsonPlan = thread.exchanges.length > 0 &&
            thread.exchanges[0].content &&
            (thread.exchanges[0].content.includes('For PLAN responses, return a JSON object with this exact structure:') ||
                thread.exchanges[0].content.includes('Your entire response must be parseable as JSON'));

        if (requiresJsonPlan) {
            console.log('[Brain Chat] Detected request requiring a JSON plan, ensuring JSON response format');
            if (!thread.optionals) thread.optionals = {};
            thread.optionals.response_format = { "type": "json_object" };
            thread.optionals.temperature = 0.2;

            if (!thread.exchanges.some(ex => ex.role === 'system')) {
                thread.exchanges.unshift({
                    role: 'system',
                    content: 'You are a JSON generation assistant. You must respond with valid JSON only. Your entire response must be parseable as JSON. Do not include any explanations, markdown, or code blocks - just the raw JSON object.'
                });
            }
        }

        return thread;
    }

    private filterInternalParameters(optionals: any): any {
        const internalParams = [
            'response_format',
            'response_type',
            'conversationType',
            'optimization',
            'optionals'
        ];

        const filtered: any = {};
        for (const [key, value] of Object.entries(optionals)) {
            if (!internalParams.includes(key)) {
                filtered[key] = value;
            }
        }
        return filtered;
    }

    // Enhanced enrichContextWithVerbsAndTools method with caching and fallback
    private async enrichContextWithVerbsAndTools(goal: string, context?: string, missionId?: string): Promise<{relevantVerbs: any[], relevantTools: any[], discoveryContext: any}> {
        // Check cache first
        const cacheKey = this.hashGoal(goal, context, missionId);
        if (this.enrichmentCache.has(cacheKey)) {
            console.log(`[Brain] Using cached enrichment for goal: ${goal}`);
            return this.enrichmentCache.get(cacheKey)!;
        }

        try {
            // Ensure librarian URL is discovered
            if (!this.librarianUrl) {
                await this.discoverLibrarianService();
            }
            if (!this.librarianUrl) {
                console.warn('[Brain] Librarian service URL not found, cannot enrich context with verbs/tools.');
                const fallbackVerbs = this.getFallbackVerbs();
                const fallbackTools = this.getFallbackTools();
                const result = { relevantVerbs: fallbackVerbs, relevantTools: fallbackTools, discoveryContext: {} };
                this.enrichmentCache.set(cacheKey, result);
                return result;
            }

            const body: any = { goal };
            if (context && context.length > 0) {
                body.context = context;
            }
            if (missionId && missionId.length > 0) {
                body.missionId = missionId;
            }

            console.log(`[Brain] Discovering verbs and tools for goal: ${goal}`);

            // Create token-efficient prompt for discovery request
            const tokenEfficientPrompt = this.createTokenEfficientPrompt(body.goal, body.context || '', body.missionId || '');
            body.prompt = tokenEfficientPrompt;
            
            // Use token-efficient prompt when sending to Librarian
            const response = await this.authenticatedApi.post(`http://${this.librarianUrl}/verbs/discover-for-planning`, body);
            const data = response.data;
            const result = {
                relevantVerbs: data.relevantVerbs || [],
                relevantTools: data.relevantTools || [],
                discoveryContext: data.discoveryContext || {}
            };
            // Cache the result
            this.enrichmentCache.set(cacheKey, result);
            return result;
        } catch (error) {
            console.error('[Brain] Error enriching context with verbs and tools:', error instanceof Error ? error.message : String(error));
            // Fallback to common known verbs and tools when discovery fails
            const fallbackVerbs = this.getFallbackVerbs();
            const fallbackTools = this.getFallbackTools();
            const result = { relevantVerbs: fallbackVerbs, relevantTools: fallbackTools, discoveryContext: {} };
            this.enrichmentCache.set(cacheKey, result);
            return result;
        }
    }

    // Helper methods for context enrichment
    private hashGoal(goal: string, context?: string, missionId?: string): string {
        const hash = crypto.createHash('sha256');
        hash.update(goal || '');
        if (context) hash.update(context);
        if (missionId) hash.update(missionId);
        return hash.digest('hex');
    }

    private getFallbackVerbs(): any[] {
        return [
            { verb: "SEARCH", description: "Search the web for information", capabilities: ["web_search"] },
            { verb: "ANALYZE", description: "Analyze data or text", capabilities: ["data_analysis"] },
            { verb: "SUMMARIZE", description: "Summarize content", capabilities: ["summarization"] },
        ];
    }

    private getFallbackTools(): any[] {
        return [
            { toolId: "web-search", name: "Web Search Tool", verbs: ["SEARCH"], description: "Perform web searches" },
            { toolId: "data-analysis", name: "Data Analysis Tool", verbs: ["ANALYZE"], description: "Analyze datasets" },
        ];
    }

    // Create token-efficient prompt for discovery requests
    private createTokenEfficientPrompt(goal: string, context?: string, missionId?: string): string {
        // Estimate token count (rough approximation: 4 chars per token)
        let currentTokenEstimate = Math.floor(goal.length / 4);
        if (context) currentTokenEstimate += Math.floor(context.length / 4);
        if (missionId) currentTokenEstimate += Math.floor(missionId.length / 4);
        // If within reasonable limit, return simple concatenation
        if (currentTokenEstimate <= 2500) {
            return goal + (context ? ' ' + context : '') + (missionId ? ' ' + missionId : '');
        }
        // If over limit, truncate each component proportionally
        const truncate = (str: string, maxChars: number) => str.length > maxChars ? str.substring(0, maxChars) + '...' : str;
        const truncateGoal = truncate(goal, Math.floor(2500 / 3));
        const truncateContext = context ? truncate(context, Math.floor(2500 / 3)) : '';
        const truncateMissionId = missionId ? truncate(missionId, Math.floor(2500 / 3)) : '';
        return truncateGoal + ' ' + truncateContext + ' ' + truncateMissionId;
    }

} // End of Brain class

new Brain()