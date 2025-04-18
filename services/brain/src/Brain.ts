import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import { OptimizationType, ModelManager } from './utils/modelManager';
import { LLMConversationType } from './interfaces/baseInterface';
import { ExchangeType } from './services/baseService';
import { BaseEntity, MessageType } from '@cktmcs/shared';
import dotenv from 'dotenv';
import { analyzeError } from '@cktmcs/errorhandler';
import { PromptManager } from './utils/promptManager';
import { ResponseEvaluator } from './utils/responseEvaluator';
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
const POSTOFFICE_URL = process.env.POSTOFFICE_URL || 'postoffice:5020';

export class Brain extends BaseEntity {
    private modelManager: ModelManager;
    private promptManager: PromptManager;
    private responseEvaluator: ResponseEvaluator;
    private llmCalls: number = 0;
    private handleEvaluations!: (req: express.Request, res: express.Response) => void;

    constructor() {
        super('Brain', 'Brain', `brain`, process.env.PORT || '5020');
        this.modelManager = new ModelManager();
        this.promptManager = new PromptManager();
        this.responseEvaluator = new ResponseEvaluator();
        this.init();
    }

    init() {
        // Middleware
        app.use(bodyParser.json());

        // Use the BaseEntity verifyToken method for authentication
        app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
            // Skip authentication for health and models/health endpoints
            if (req.path === '/health' || req.path === '/models/health') {
                return next();
            }

            // Use the BaseEntity verifyToken method
            this.verifyToken(req, res, next);
        });

        // Add health check endpoint
        app.get('/health', (req: express.Request, res: express.Response) => {
            res.json({ status: 'ok', message: 'Brain service is running' });
        });

        // API endpoint to check the health of all LLM models - no auth required
        app.get('/models/health', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            this.checkModelsHealth()
                .then(healthReport => {
                    res.json(healthReport);
                })
                .catch(error => {
                    next(error);
                });
        });

        // Global error handler
        app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
            console.error('Express error in Brain:', err instanceof Error ? err.message : String(err));
            analyzeError(err as Error);
            res.status(501).json({ error: 'Internal server error' });
        });

        // API endpoint for message handling
        app.post('/message', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                await this.handleMessage(req, res);
            } catch (error) {
                next(error);
            }
        });

        // API endpoint for processThread
        app.post('/chat', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                await this.chat(req, res);
            } catch (error) {
                next(error); // Pass errors to the global error handler
            }
        });

        // Direct OpenWebUI chat endpoint for testing
        app.post('/openwebui/chat', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            this.handleDirectOpenWebUIChat(req, res, next);
        });

        app.post('/generate', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                await this.generate(req, res);
            } catch (error) {
                next(error); // Pass errors to the global error handler
            }
        });

        //API endpoint to report LLMCall total
        app.get('/getLLMCalls', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            res.json({ llmCalls: this.llmCalls });
        });

        // API endpoint to get available models
        app.get('/models', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            const models = this.getAvailableModels();
            res.json({ models });
        });

        // API endpoints for prompt management
        app.get('/prompts', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            const prompts = this.promptManager.getAllTemplates();
            res.json({ prompts });
        });

        app.get('/prompts/:id', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            const prompt = this.promptManager.getTemplate(req.params.id);
            if (!prompt) {
                res.status(404).json({ error: 'Prompt template not found' });
            }
            res.json({ prompt });
        });

        app.post('/prompts', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                const prompt = this.promptManager.createTemplate(req.body);
                res.status(201).json({ prompt });
            } catch (error) {
                res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid prompt template' });
            }
        });

        app.put('/prompts/:id', (req: express.Request, res: express.Response) => {
            try {
                const prompt = this.promptManager.updateTemplate(req.params.id, req.body);
                if (!prompt) {
                    res.status(404).json({ error: 'Prompt template not found' });
                }
                res.json({ prompt });
            } catch (error) {
                res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid prompt template' });
            }
        });

        app.delete('/prompts/:id', (req: express.Request, res: express.Response) => {
            const deleted = this.promptManager.deleteTemplate(req.params.id);
            if (!deleted) {
                res.status(404).json({ error: 'Prompt template not found' });
            }
            res.json({ success: true });
        });

        app.post('/prompts/:id/render', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                const renderedPrompt = this.promptManager.renderTemplate(req.params.id, req.body.variables);
                res.json({ renderedPrompt });
            } catch (error) {
                res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid prompt template or variables' });
            }
        });

        // API endpoints for model performance
        app.get('/performance', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                const performanceData = this.modelManager.getAllPerformanceData();
                res.json({ performanceData });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).json({ error: 'Failed to get performance data' });
            }
        });

        app.get('/performance/rankings', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                const conversationType = req.query.conversationType as LLMConversationType || LLMConversationType.TextToText;
                const metric = req.query.metric as 'successRate' | 'averageLatency' | 'overall' || 'overall';
                const rankings = this.modelManager.getModelRankings(conversationType, metric);
                res.json({ rankings });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).json({ error: 'Failed to get model rankings' });
            }
        });

        app.get('/performance/metrics/:modelName', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                const { modelName } = req.params;
                const conversationType = req.query.conversationType as LLMConversationType || LLMConversationType.TextToText;
                const metrics = this.modelManager.getModelPerformanceMetrics(modelName, conversationType);
                res.json({ metrics });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).json({ error: 'Failed to get model metrics' });
            }
        });

        app.get('/performance/blacklisted', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                const blacklistedModels = this.modelManager.getBlacklistedModels();
                res.json({ blacklistedModels });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).json({ error: 'Failed to get blacklisted models' });
            }
        });

        app.get('/performance/summary', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                const summary = this.modelManager.getPerformanceSummary();
                res.json({ summary });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).json({ error: 'Failed to get performance summary' });
            }
        });

        // API endpoints for response evaluation
        app.get('/evaluations', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                const limit = parseInt(req.query.limit as string) || 100;
                const evaluations = this.responseEvaluator.getAllEvaluations(limit);
                res.json({ evaluations });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).json({ error: 'Failed to get evaluations' });
            }
        });

        app.get('/evaluations/model/:modelName', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                const evaluations = this.responseEvaluator.getEvaluationsForModel(req.params.modelName);
                res.json({ evaluations });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).json({ error: 'Failed to get model evaluations' });
            }
        });

        // Add evaluations endpoint as a class method
        this.handleEvaluations = (req: express.Request, res: express.Response) => {
            try {
                const { modelName, conversationType, requestId, prompt, response, scores, comments } = req.body;

                if (!modelName || !conversationType || !prompt || !response || !scores) {
                    return res.status(400).json({ error: 'Missing required fields' });
                }

                const evaluation = this.responseEvaluator.recordHumanEvaluation({
                    modelName,
                    conversationType,
                    requestId: requestId || uuidv4(),
                    prompt,
                    response,
                    scores,
                    comments
                });

                res.status(201).json({ evaluation });
            } catch (error) {
                analyzeError(error as Error);
                res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid evaluation data' });
            }
        };

        app.post('/evaluations', this.handleEvaluations);

        app.get('/evaluations/summary', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                const summaries = this.responseEvaluator.getEvaluationSummaries();
                res.json({ summaries });
            } catch (error) {
                analyzeError(error as Error);
                res.status(500).json({ error: 'Failed to get evaluation summaries' });
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
            // Optionally, you can choose to exit here if it's a critical error
            // process.exit(1);
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
                const convertParams =  req.body.convertParams;
                convertParams.max_length = convertParams.max_length ? Math.min(convertParams.max_length, model.tokenLimit) : model.tokenLimit;
                model.llminterface?.convert(model.service, conversationType, convertParams);
            }
        } catch (error) {
            analyzeError(error as Error);
            res.status(400).json({ error: 'Invalid request' });
        }
    }

    async chat(req: express.Request, res: express.Response) {
        try {
            const thread = {
                exchanges: req.body.exchanges,
                optimization: req.body.optimization,
                optionals: req.body.optionals || {},
                conversationType: req.body.ConversationType || LLMConversationType.TextToText
            };

            // Check if a prompt template ID is provided
            if (req.body.promptTemplateId && req.body.variables) {
                try {
                    // Render the prompt template
                    const renderedPrompt = this.promptManager.renderTemplate(req.body.promptTemplateId, req.body.variables);

                    // Add the rendered prompt to the exchanges
                    thread.exchanges.push({ role: 'user', content: renderedPrompt });
                } catch (error) {
                    console.error('Error rendering prompt template:', error);
                    // Continue with the original exchanges
                }
            }

            // Get all available models for potential retries
            const maxRetries = 3; // Maximum number of models to try
            let currentRetry = 0;
            let lastError = null;
            let modelResponse = null;
            let selectedModel = null;
            let requestId = null;
            let startTime = 0;
            let endTime = 0;
            let responseTime = 0;
            let tokenCount = 0;

            // Try multiple models until we get a valid response or run out of retries
            while (currentRetry < maxRetries) {
                try {
                    // Select the best model based on optimization criteria
                    selectedModel = this.modelManager.selectModel(thread.optimization, thread.conversationType);

                    // Log the selected model
                    console.log(`Selected model: ${selectedModel ? selectedModel.name : 'none'}`);

                    if (!selectedModel) {
                        // If we've run out of models, check if we have any models at all
                        const availableModels = this.modelManager.getAvailableModels();
                        if (availableModels.length === 0) {
                            // No models available at all - critical system failure
                            console.error('CRITICAL: No LLM models available. System cannot function.');
                            res.status(503).json({
                                error: 'No LLM models available. Please check your configuration and API keys.',
                                systemFailure: true
                            });
                            return;
                        }

                        // We have models but none suitable for this request
                        res.json({ response: 'No suitable model found.', mimeType: 'text/plain' });
                        console.log('No suitable model found.');
                        return;
                    }

                    this.logAndSay(`Chatting with model ${selectedModel.modelName} using interface ${selectedModel.interfaceName} (attempt ${currentRetry + 1}/${maxRetries})`);

                    // Track the request for performance monitoring
                    requestId = this.modelManager.trackModelRequest(
                        selectedModel.name,
                        thread.conversationType,
                        thread.exchanges[thread.exchanges.length - 1].content
                    );

                    // Extract only the message content from the exchanges
                    const messages = thread.exchanges;
                    this.llmCalls++;
                    thread.optionals.modelName = selectedModel.modelName;

                    // Start timing the response
                    startTime = Date.now();

                    // Get the response from the model
                    modelResponse = await selectedModel.chat(messages, { ...thread.optionals, modelName: selectedModel.modelName });

                    // End timing the response
                    endTime = Date.now();
                    responseTime = endTime - startTime;

                    this.logAndSay(`Model response: ${modelResponse}`);

                    // Check if the response is valid
                    if (!modelResponse || modelResponse === 'No response generated') {
                        // Track the failed response
                        this.modelManager.trackModelResponse(requestId, '', 0, false, 'No response generated');
                        throw new Error('No response generated');
                    }

                    // If we get here, we have a valid response
                    break;

                } catch (error) {
                    lastError = error;
                    console.log(`Model attempt ${currentRetry + 1}/${maxRetries} failed:`, error instanceof Error ? error.message : String(error));

                    // If we have a selected model that failed, blacklist it temporarily
                    if (selectedModel) {
                        // Track the failed response if we have a requestId
                        if (requestId) {
                            this.modelManager.trackModelResponse(
                                requestId,
                                '',
                                0,
                                false,
                                error instanceof Error ? error.message : String(error)
                            );
                        }

                        // Force the model to be blacklisted by recording multiple consecutive failures
                        const metrics = this.modelManager.getModelPerformanceMetrics(
                            selectedModel.name,
                            thread.conversationType
                        );

                        // Log the failure for debugging
                        console.log(`Model ${selectedModel.name} failed. Current consecutive failures: ${metrics.consecutiveFailures}`);
                    }

                    // Move to the next retry
                    currentRetry++;
                }
            }

            // If we've exhausted all retries and still don't have a response
            if (!modelResponse || modelResponse === 'No response generated') {
                console.error('All model attempts failed. Last error:', lastError);
                res.json({
                    response: 'All available models failed to generate a response. Please try again later.',
                    mimeType: 'text/plain',
                    error: lastError instanceof Error ? lastError.message : String(lastError)
                });
                return;
            }

            // We have a successful response - track it
            // At this point, modelResponse, requestId, and selectedModel should not be null
            // because we've checked for valid responses above
            if (modelResponse && requestId && selectedModel) {
                tokenCount = modelResponse.split(/\s+/).length; // Simple approximation
                this.modelManager.trackModelResponse(requestId, modelResponse, tokenCount, true);

                // Evaluate the response
                this.responseEvaluator.evaluateResponseAuto(
                    requestId,
                    selectedModel.name,
                    thread.conversationType,
                    thread.exchanges[thread.exchanges.length - 1].content,
                    modelResponse
                ).catch(error => {
                    console.error('Error evaluating response:', error);
                    // Continue without evaluation
                });

                const mimeType = this.determineMimeType(modelResponse);
                res.json({
                    response: modelResponse,
                    mimeType: mimeType,
                    modelName: selectedModel.name,
                    requestId: requestId,
                    responseTime: responseTime,
                    tokenCount: tokenCount
                });
            } else {
                // This should never happen, but just in case
                console.error('Unexpected null values after successful model response');
                res.status(500).json({ error: 'Unexpected error processing model response' });
            }
        } catch (error) {
            console.log('Chat Error in Brain:',error instanceof Error ? error.message : String(error));
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

    /**
     * Get the interface manager
     * @returns The interface manager
     */
    getInterfaceManager() {
        return this.modelManager.getInterfaceManager();
    }

    /**
     * Get the service manager
     * @returns The service manager
     */
    getServiceManager() {
        return this.modelManager.getServiceManager();
    }

    /**
     * Check the health of all LLM models.
     * @returns A health report for all models
     */
    async checkModelsHealth(): Promise<any> {
        const modelNames = this.modelManager.getAvailableModels();
        const allModels = this.modelManager.getAllModels();
        const healthReport: any = {
            totalModels: modelNames.length,
            availableModels: 0,
            unavailableModels: 0,
            models: []
        };

        // Get all interfaces and services for reporting
        const interfaceManager = this.getInterfaceManager();
        const serviceManager = this.getServiceManager();
        const allInterfaces = interfaceManager.getAllInterfaces();
        const allServices = serviceManager.getAllServices();

        // Report on interfaces
        const interfaceReport: any = {};
        for (const [name, interfaceInstance] of allInterfaces) {
            interfaceReport[name] = {
                name,
                available: true, // Interfaces are always available
                models: []
            };
        }

        // Report on services
        const serviceReport: any = {};
        for (const [name, serviceInstance] of allServices) {
            serviceReport[name] = {
                name,
                available: serviceInstance.isAvailable(),
                apiKeySet: !!serviceInstance.apiKey,
                apiUrlSet: !!serviceInstance.apiUrl,
                models: []
            };
        }

        // Process all models
        for (const modelName of modelNames) {
            const model = allModels.get(modelName);
            if (!model) continue;

            const modelHealth = {
                name: model.name,
                modelName: model.modelName,
                interfaceName: model.interfaceName,
                serviceName: model.serviceName,
                available: model.isAvailable(),
                tokenLimit: model.tokenLimit,
                supportedConversationTypes: model.contentConversation,
                serviceAvailable: model.service?.isAvailable() || false,
                interfaceAvailable: !!model.llminterface,
                apiKeySet: !!model.service?.apiKey
            };

            if (modelHealth.available) {
                healthReport.availableModels++;
            } else {
                healthReport.unavailableModels++;
            }

            healthReport.models.push(modelHealth);

            // Add model to interface report
            if (interfaceReport[model.interfaceName]) {
                interfaceReport[model.interfaceName].models.push(modelHealth);
            }

            // Add model to service report
            if (serviceReport[model.serviceName]) {
                serviceReport[model.serviceName].models.push(modelHealth);
            }
        }

        // Group models by provider
        const modelsByProvider: any = {};
        for (const model of healthReport.models) {
            const provider = model.interfaceName;
            if (!modelsByProvider[provider]) {
                modelsByProvider[provider] = {
                    provider,
                    totalModels: 0,
                    availableModels: 0,
                    unavailableModels: 0,
                    models: []
                };
            }

            modelsByProvider[provider].totalModels++;
            if (model.available) {
                modelsByProvider[provider].availableModels++;
            } else {
                modelsByProvider[provider].unavailableModels++;
            }
            modelsByProvider[provider].models.push(model);
        }

        // Add additional information about interfaces and services
        healthReport.providers = Object.values(modelsByProvider);
        healthReport.interfaces = Object.values(interfaceReport);
        healthReport.services = Object.values(serviceReport);

        // Add information about missing interfaces
        healthReport.missingInterfaces = [];
        if (!allInterfaces.has('gemini') && !modelsByProvider['gemini']) {
            healthReport.missingInterfaces.push({
                name: 'gemini',
                reason: 'Interface not implemented or empty'
            });
        }
        if (!allInterfaces.has('huggingface') && !modelsByProvider['huggingface']) {
            healthReport.missingInterfaces.push({
                name: 'huggingface',
                reason: 'Interface not registered properly'
            });
        }
        if (!allInterfaces.has('openrouter') && !modelsByProvider['openrouter']) {
            healthReport.missingInterfaces.push({
                name: 'openrouter',
                reason: 'Interface not registered properly'
            });
        }

        return healthReport;
    }

    private determineMimeType(response: string): string {
        if (response.startsWith('<html>')) {
            return 'text/html';
        }
        return 'text/plain';
    }

    /**
     * Handle direct OpenWebUI chat requests for testing
     */
    private handleDirectOpenWebUIChat(req: express.Request, res: express.Response, next: express.NextFunction): void {
        try {
            const owService = this.getServiceManager().getService('OWService');
            if (!owService || !owService.isAvailable()) {
                res.status(503).json({ error: 'OpenWebUI service is not available' });
                return;
            }

            const openWebUIInterface = this.getInterfaceManager().getInterface('openwebui');
            if (!openWebUIInterface) {
                res.status(503).json({ error: 'OpenWebUI interface is not available' });
                return;
            }

            console.log('Direct OpenWebUI chat request received');
            const messages = req.body.messages || [];
            const options = req.body.options || {};

            openWebUIInterface.chat(owService, messages, options)
                .then((response: string) => {
                    res.json({ response });
                })
                .catch((error: unknown) => {
                    console.error('Error in direct OpenWebUI chat:', error instanceof Error ? error.message : String(error));
                    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
                });
        } catch (error) {
            console.error('Error in direct OpenWebUI chat:', error instanceof Error ? error.message : String(error));
            next(error);
        }
    }



    // Handle HTTP messages
    private async handleMessage(req: express.Request, res: express.Response) {
        try {
            const message = req.body;
            await this.processMessage(message);
            res.status(200).send({ status: 'Message processed successfully' });
        } catch (error) {
            console.error('Error processing message:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to process message' });
        }
    }

    // Override the handleQueueMessage method from BaseEntity
    protected async handleQueueMessage(message: any) {
        try {
            await this.processMessage(message);
            console.log(`Queue message of type ${message.type} processed successfully`);
        } catch (error) {
            console.error('Error processing queue message:', error instanceof Error ? error.message : error);
        }
    }

    // Common message processing logic for both HTTP and queue messages
    private async processMessage(message: any): Promise<void> {
        console.log('Brain processing message:', message);

        // First, handle standard message types using the base class handler
        await super.handleBaseMessage(message);

        // Then handle Brain-specific message types
        if (message.type === MessageType.CHAT_REQUEST) {
            // Process a chat request that came via message instead of direct API call
            try {
                const result = await this.processChatRequest(message.content);

                // Send the response back to the sender
                await this.sendMessage(MessageType.CHAT_RESPONSE, message.sender, {
                    requestId: message.content.requestId,
                    response: result.response,
                    mimeType: result.mimeType,
                    modelName: result.modelName,
                    responseTime: result.responseTime,
                    tokenCount: result.tokenCount
                });
            } catch (error) {
                console.error('Error processing chat request:', error instanceof Error ? error.message : error);
                // Send error response
                await this.sendMessage(MessageType.CHAT_RESPONSE, message.sender, {
                    requestId: message.content.requestId,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }

    // Process a chat request and return the result
    private async processChatRequest(content: any): Promise<{ response: string, mimeType: string, modelName?: string, requestId?: string, responseTime?: number, tokenCount?: number, error?: string }> {
        const thread: Thread = {
            exchanges: content.exchanges,
            optimization: content.optimization,
            optionals: content.optionals,
            conversationType: content.conversationType || LLMConversationType.TextToText
        };

        // Check if a prompt template ID is provided
        if (content.promptTemplateId && content.variables) {
            try {
                // Render the prompt template
                const renderedPrompt = this.promptManager.renderTemplate(content.promptTemplateId, content.variables);

                // Add the rendered prompt to the exchanges
                thread.exchanges.push({ role: 'user', content: renderedPrompt });
            } catch (error) {
                console.error('Error rendering prompt template:', error);
                // Continue with the original exchanges
            }
        }

        // Get all available models for potential retries
        const maxRetries = 3; // Maximum number of models to try
        let currentRetry = 0;
        let lastError = null;
        let modelResponse = null;
        let selectedModel = null;
        let requestId = null;
        let startTime = 0;
        let endTime = 0;
        let responseTime = 0;
        let tokenCount = 0;

        // Try multiple models until we get a valid response or run out of retries
        while (currentRetry < maxRetries) {
            try {
                // Select the best model based on optimization criteria
                selectedModel = this.modelManager.selectModel(thread.optimization || 'accuracy', thread.conversationType || LLMConversationType.TextToText);

                // Log the selected model
                console.log(`Selected model: ${selectedModel ? selectedModel.name : 'none'}`);

                if (!selectedModel || !selectedModel.isAvailable()) {
                    // If we've run out of models, check if we have any models at all
                    const availableModels = this.modelManager.getAvailableModels();
                    if (availableModels.length === 0) {
                        // No models available at all - critical system failure
                        console.error('CRITICAL: No LLM models available. System cannot function.');
                        return {
                            response: 'No LLM models available. Please check your configuration and API keys.',
                            mimeType: 'text/plain',
                            error: 'System failure: No LLM models available'
                        };
                    }

                    // We have models but none suitable for this request
                    return { response: 'No suitable model found.', mimeType: 'text/plain' };
                }

                console.log(`Chatting with model ${selectedModel.modelName} using interface ${selectedModel.interfaceName} (attempt ${currentRetry + 1}/${maxRetries})`);

                // Track the request for performance monitoring
                requestId = this.modelManager.trackModelRequest(
                    selectedModel.name,
                    thread.conversationType || LLMConversationType.TextToText,
                    thread.exchanges[thread.exchanges.length - 1].content
                );

                // Extract only the message content from the exchanges
                const messages = thread.exchanges;
                this.llmCalls++;
                thread.optionals = thread.optionals || {};
                thread.optionals.modelName = selectedModel.modelName;

                // Start timing the response
                startTime = Date.now();

                // Get the response from the model
                modelResponse = await selectedModel.chat(messages, { ...thread.optionals, modelName: selectedModel.modelName });

                // End timing the response
                endTime = Date.now();
                responseTime = endTime - startTime;

                console.log(`Model response: ${modelResponse}`);

                // Check if the response is valid
                if (!modelResponse || modelResponse === 'No response generated') {
                    // Track the failed response
                    this.modelManager.trackModelResponse(requestId, '', 0, false, 'No response generated');
                    throw new Error('No response generated');
                }

                // If we get here, we have a valid response
                break;

            } catch (error) {
                lastError = error;
                console.log(`Model attempt ${currentRetry + 1}/${maxRetries} failed:`, error instanceof Error ? error.message : String(error));

                // If we have a selected model that failed, blacklist it temporarily
                if (selectedModel) {
                    // Track the failed response if we have a requestId
                    if (requestId) {
                        this.modelManager.trackModelResponse(
                            requestId,
                            '',
                            0,
                            false,
                            error instanceof Error ? error.message : String(error)
                        );
                    }

                    // Force the model to be blacklisted by recording multiple consecutive failures
                    const metrics = this.modelManager.getModelPerformanceMetrics(
                        selectedModel.name,
                        thread.conversationType || LLMConversationType.TextToText
                    );

                    // Log the failure for debugging
                    console.log(`Model ${selectedModel.name} failed. Current consecutive failures: ${metrics.consecutiveFailures}`);
                }

                // Move to the next retry
                currentRetry++;
            }
        }

        // If we've exhausted all retries and still don't have a response
        if (!modelResponse || modelResponse === 'No response generated') {
            console.error('All model attempts failed. Last error:', lastError);
            return {
                response: 'All available models failed to generate a response. Please try again later.',
                mimeType: 'text/plain',
                error: lastError instanceof Error ? lastError.message : String(lastError)
            };
        }

        // We have a successful response - track it
        if (modelResponse && requestId && selectedModel) {
            tokenCount = modelResponse.split(/\s+/).length; // Simple approximation
            this.modelManager.trackModelResponse(requestId, modelResponse, tokenCount, true);

            // Evaluate the response
            this.responseEvaluator.evaluateResponseAuto(
                requestId,
                selectedModel.name,
                thread.conversationType || LLMConversationType.TextToText,
                thread.exchanges[thread.exchanges.length - 1].content,
                modelResponse
            ).catch(error => {
                console.error('Error evaluating response:', error);
                // Continue without evaluation
            });

            const mimeType = this.determineMimeType(modelResponse);
            return {
                response: modelResponse,
                mimeType,
                modelName: selectedModel.name,
                requestId,
                responseTime,
                tokenCount
            };
        } else {
            // This should never happen, but just in case
            console.error('Unexpected null values after successful model response');
            return {
                response: 'Unexpected error processing model response',
                mimeType: 'text/plain',
                error: 'Internal server error'
            };
        }
    }
}

// Create an instance of the Brain
new Brain();
