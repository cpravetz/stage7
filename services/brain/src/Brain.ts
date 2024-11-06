import express from 'express';
import bodyParser from 'body-parser';
import { OptimizationType, ModelManager } from './utils/modelManager';
import { Model, LLMConversionType } from './models/Model';
import { BaseEntity } from '@cktmcs/shared';
import dotenv from 'dotenv';

dotenv.config();

interface Thread {
    exchanges: Array<{ role: string, content: string }>;
    optimization?: OptimizationType;
    metadata?: Record<string, any>;
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

        // API endpoint for processThread
        app.post('/chat', async (req: express.Request, res: express.Response) => {
            this.chat(req, res);
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
    }


    async chat(req: express.Request, res: express.Response) {
        try {
            const thread = {
                exchanges: req.body.exchanges,
                optimization: req.body.optimization,
                metadata: req.body.metadata || null,
                conversionType: req.body.conversionType || LLMConversionType.TextToText
            };
            const selectedModel = req.body.model || this.modelManager.selectModel(thread.optimization, thread.conversionType);
            this.logAndSay(`Chatting with model ${selectedModel.model.name} using interface ${selectedModel.model.interfaceKey}`);
            if (!selectedModel) {
                throw new Error('No suitable model found.');
            }
    
            // Extract only the message content from the exchanges
            const messages = thread.exchanges;
    
            this.llmCalls++;
    
            const brainResponse = await selectedModel.interface.generate(messages, {
                max_length: thread.metadata?.max_length,
                temperature: thread.metadata?.temperature
            });
    
            const mimeType = this.determineMimeType(brainResponse);
            res.json({
                response: brainResponse,
                mimeType: mimeType
            });
        } catch (error) {
            console.error('Error processing thread:', error);
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
    
}

// Create an instance of the Brain
new Brain();
