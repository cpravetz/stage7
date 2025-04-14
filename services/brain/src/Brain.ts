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

        // Create a function to check authentication
        const checkAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
            // Skip authentication for health and models/health endpoints
            if (req.path === '/health' || req.path === '/models/health') {
                return next();
            }

            // Skip authentication in development mode if configured
            if (process.env.SKIP_AUTH === 'true' || process.env.NODE_ENV === 'development') {
                return next();
            }

            // Check for authentication token
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'No token provided' });
            }

            // Token is present, proceed with the request
            next();
        };

        // Apply authentication to all routes except health checks
        app.use((req, res, next) => {
            if (req.path === '/health' || req.path === '/models/health') {
                return next();
            }
            checkAuth(req, res, next);
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
            const performanceData = this.modelManager.getAllPerformanceData();
            res.json({ performanceData });
        });

        app.get('/performance/rankings', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            const conversationType = req.query.conversationType as LLMConversationType || LLMConversationType.TextToText;
            const metric = req.query.metric as 'successRate' | 'averageLatency' | 'overall' || 'overall';
            const rankings = this.modelManager.getModelRankings(conversationType, metric);
            res.json({ rankings });
        });

        // API endpoints for response evaluation
        app.get('/evaluations', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            const limit = parseInt(req.query.limit as string) || 100;
            const evaluations = this.responseEvaluator.getAllEvaluations(limit);
            res.json({ evaluations });
        });

        app.get('/evaluations/model/:modelName', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            const evaluations = this.responseEvaluator.getEvaluationsForModel(req.params.modelName);
            res.json({ evaluations });
        });

        app.post('/evaluations', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                const { requestId, modelName, conversationType, prompt, response, criteria, feedback, evaluator } = req.body;
                const evaluation = this.responseEvaluator.recordHumanEvaluation(
                    requestId,
                    modelName,
                    conversationType,
                    prompt,
                    response,
                    criteria,
                    feedback,
                    evaluator
                );
                res.status(201).json({ evaluation });
            } catch (error) {
                res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid evaluation data' });
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

            // Select the appropriate model
            const selectedModel = this.modelManager.getModel(req.body.model) || this.modelManager.selectModel(thread.optimization, thread.conversationType);
            if (!selectedModel) {
                res.json({ response: 'No suitable model found.', mimeType: 'text/plain' });
                console.log('No suitable model found.');
                return;
            }

            this.logAndSay(`Chatting with model ${selectedModel.modelName} using interface ${selectedModel.interfaceName}`);

            // Track the request for performance monitoring
            const requestId = this.modelManager.trackModelRequest(
                selectedModel.name,
                thread.conversationType,
                thread.exchanges[thread.exchanges.length - 1].content
            );

            // Extract only the message content from the exchanges
            const messages = thread.exchanges;
            this.llmCalls++;
            thread.optionals.modelName = selectedModel.modelName;

            // Start timing the response
            const startTime = Date.now();

            // Get the response from the model
            const modelResponse = await selectedModel.chat(messages, { ...thread.optionals, modelName: selectedModel.modelName });

            // End timing the response
            const endTime = Date.now();
            const responseTime = endTime - startTime;

            this.logAndSay(`Model response: ${modelResponse}`);

            if (!modelResponse || modelResponse == 'No response generated') {
                // Track the failed response
                this.modelManager.trackModelResponse(requestId, '', 0, false, 'No response generated');

                res.json({ response: 'No response generated.', mimeType: 'text/plain' });
                return;
            }

            // Track the successful response
            const tokenCount = modelResponse.split(/\s+/).length; // Simple approximation
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
    private async processChatRequest(content: any): Promise<{ response: string, mimeType: string, modelName?: string, requestId?: string, responseTime?: number, tokenCount?: number }> {
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

        // Select the appropriate model
        const selectedModel = content.modelName
            ? this.modelManager.getModel(content.modelName)
            : this.modelManager.selectModel(thread.optimization || 'accuracy', thread.conversationType || LLMConversationType.TextToText);

        if (!selectedModel || !selectedModel.isAvailable()) {
            return { response: 'No suitable model found.', mimeType: 'text/plain' };
        }

        // Track the request for performance monitoring
        const requestId = this.modelManager.trackModelRequest(
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
        const startTime = Date.now();

        // Get the response from the model
        const modelResponse = await selectedModel.chat(messages, { ...thread.optionals, modelName: selectedModel.modelName });

        // End timing the response
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        if (!modelResponse || modelResponse == 'No response generated') {
            // Track the failed response
            this.modelManager.trackModelResponse(requestId, '', 0, false, 'No response generated');
            return { response: 'No response generated.', mimeType: 'text/plain' };
        }

        // Track the successful response
        const tokenCount = modelResponse.split(/\s+/).length; // Simple approximation
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
    }
}

// Create an instance of the Brain
new Brain();
