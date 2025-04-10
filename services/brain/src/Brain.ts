import express from 'express';
import bodyParser from 'body-parser';
import { OptimizationType, ModelManager } from './utils/modelManager';
import { LLMConversationType } from './interfaces/baseInterface';
import { ExchangeType } from './services/baseService';
import { BaseEntity } from '@cktmcs/shared';
import dotenv from 'dotenv';
import { analyzeError } from '@cktmcs/errorhandler';

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
    private llmCalls: number = 0;

    constructor() {
        super('Brain', 'Brain', `brain`, process.env.PORT || '5020');
        this.modelManager = new ModelManager();
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
            const selectedModel = this.modelManager.getModel(req.body.model) || this.modelManager.selectModel(thread.optimization, thread.conversationType);
            if (!selectedModel) {
                res.json({ response: 'No suitable model found.', mimeType: 'text/plain' });
                console.log('No suitable model found.');
            } else {
                this.logAndSay(`Chatting with model ${selectedModel.modelName} using interface ${selectedModel.interfaceName}`);

                // Extract only the message content from the exchanges
                const messages = thread.exchanges;
                this.llmCalls++;
                thread.optionals.modelName = selectedModel.modelName;
                const modelResponse = await selectedModel.chat(messages, thread.optionals || {});
                this.logAndSay(`Model response: ${modelResponse}`);
                if (!modelResponse || modelResponse == 'No response generated') {
                    res.json({ response: 'No response generated.', mimeType: 'text/plain' });
                    return;
                }
                const mimeType = this.determineMimeType(modelResponse);
                res.json({
                    response: modelResponse,
                    mimeType: mimeType
                });
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
                    mimeType: result.mimeType
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
    private async processChatRequest(content: any): Promise<{ response: string, mimeType: string }> {
        const thread: Thread = {
            exchanges: content.exchanges,
            optimization: content.optimization,
            optionals: content.optionals
        };

        // Select the appropriate model
        const selectedModel = content.modelName
            ? this.modelManager.getModel(content.modelName)
            : this.modelManager.selectModel(thread.optimization || 'accuracy', 'chat');

        if (!selectedModel || !selectedModel.isAvailable()) {
            return { response: 'No suitable model found.', mimeType: 'text/plain' };
        }

        // Extract only the message content from the exchanges
        const messages = thread.exchanges;
        this.llmCalls++;
        thread.optionals = thread.optionals || {};
        thread.optionals.modelName = selectedModel.modelName;

        const modelResponse = await selectedModel.chat(messages, thread.optionals);
        if (!modelResponse || modelResponse == 'No response generated') {
            return { response: 'No response generated.', mimeType: 'text/plain' };
        }

        const mimeType = this.determineMimeType(modelResponse);
        return { response: modelResponse, mimeType };
    }
}

// Create an instance of the Brain
new Brain();
