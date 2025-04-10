import express from 'express';
import bodyParser from 'body-parser';
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
        app.get('/getLLMCalls', (req: express.Request, res: express.Response) => {
            res.json({ llmCalls: this.llmCalls });
        });

        // API endpoint to get available models
        app.get('/models', (req: express.Request, res: express.Response) => {
            const models = this.getAvailableModels();
            res.json({ models });
        });

        // API endpoints for prompt management
        app.get('/prompts', (req: express.Request, res: express.Response) => {
            const prompts = this.promptManager.getAllTemplates();
            res.json({ prompts });
        });

        app.get('/prompts/:id', (req: express.Request, res: express.Response) => {
            const prompt = this.promptManager.getTemplate(req.params.id);
            if (!prompt) {
                return res.status(404).json({ error: 'Prompt template not found' });
            }
            res.json({ prompt });
        });

        app.post('/prompts', (req: express.Request, res: express.Response) => {
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
                    return res.status(404).json({ error: 'Prompt template not found' });
                }
                res.json({ prompt });
            } catch (error) {
                res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid prompt template' });
            }
        });

        app.delete('/prompts/:id', (req: express.Request, res: express.Response) => {
            const deleted = this.promptManager.deleteTemplate(req.params.id);
            if (!deleted) {
                return res.status(404).json({ error: 'Prompt template not found' });
            }
            res.json({ success: true });
        });

        app.post('/prompts/:id/render', (req: express.Request, res: express.Response) => {
            try {
                const renderedPrompt = this.promptManager.renderTemplate(req.params.id, req.body.variables);
                res.json({ renderedPrompt });
            } catch (error) {
                res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid prompt template or variables' });
            }
        });

        // API endpoints for model performance
        app.get('/performance', (req: express.Request, res: express.Response) => {
            const performanceData = this.modelManager.getAllPerformanceData();
            res.json({ performanceData });
        });

        app.get('/performance/rankings', (req: express.Request, res: express.Response) => {
            const conversationType = req.query.conversationType as LLMConversationType || LLMConversationType.TextToText;
            const metric = req.query.metric as 'successRate' | 'averageLatency' | 'overall' || 'overall';
            const rankings = this.modelManager.getModelRankings(conversationType, metric);
            res.json({ rankings });
        });

        // API endpoints for response evaluation
        app.get('/evaluations', (req: express.Request, res: express.Response) => {
            const limit = parseInt(req.query.limit as string) || 100;
            const evaluations = this.responseEvaluator.getAllEvaluations(limit);
            res.json({ evaluations });
        });

        app.get('/evaluations/model/:modelName', (req: express.Request, res: express.Response) => {
            const evaluations = this.responseEvaluator.getEvaluationsForModel(req.params.modelName);
            res.json({ evaluations });
        });

        app.post('/evaluations', (req: express.Request, res: express.Response) => {
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
        app.listen(port, () => {
            console.log(`Brain service listening at http://localhost:${port}`);
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
            const modelResponse = await selectedModel.chat(messages, thread.optionals || {});

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
            : this.modelManager.selectModel(thread.optimization || 'accuracy', thread.conversationType);

        if (!selectedModel || !selectedModel.isAvailable()) {
            return { response: 'No suitable model found.', mimeType: 'text/plain' };
        }

        // Track the request for performance monitoring
        const requestId = this.modelManager.trackModelRequest(
            selectedModel.name,
            thread.conversationType,
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
        const modelResponse = await selectedModel.chat(messages, thread.optionals);

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
            thread.conversationType,
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
