import express from 'express';
import axios from 'axios';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { storeInRedis, loadFromRedis, deleteFromRedis } from './utils/redisUtils';
import { storeInMongo, loadFromMongo, loadManyFromMongo, aggregateInMongo, deleteManyFromMongo } from './utils/mongoUtils';
import { WorkProduct, Deliverable } from '@cktmcs/shared';
import { BaseEntity, MapSerializer } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { v4 as uuidv4 } from 'uuid';
import { knowledgeStore } from './knowledgeStore';

const LARGE_ASSET_PATH = process.env.LARGE_ASSET_PATH || '/usr/src/app/shared/librarian-assets';


dotenv.config();

// NOTE: Don't use this directly - use this.authenticatedApi or this.getAuthenticatedAxios() instead
// This is kept for backward compatibility only
const api = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });

interface DataVersion {
    id: string;
    data: any;
    timestamp: Date;
    version: number;
  }


export class Librarian extends BaseEntity {
    private app: express.Application;

    constructor() {
        super('Librarian', 'Librarian', `librarian`, process.env.PORT || '5040');
        this.app = express();
        this.setupRoutes();
      this.startServer();
    }

    private isRestrictedCollection(collection: string): boolean {
        return false; // Disable restrictions for now
      const restricted = ['users', 'tokens', 'token_blacklist'];
      return restricted.includes(collection.toLowerCase());
    }

    private isCallerAuthorized(req: express.Request): boolean {
      const user = (req as any).user;
      if (!user) return false;
      return user.sub === 'SecurityManager' || user.componentType === 'SecurityManager';
    }

    private setupRoutes() {
        this.app.get('/health', (req: express.Request, res: express.Response): void => {
            res.status(200).json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                message: 'Librarian service is healthy',
            });
        });

        // --- Large Asset Streaming Routes ---
        // These routes handle raw data streams and must be defined *before* bodyParser.json() is used.
        const assetRouter = express.Router();
        assetRouter.use((req, res, next) => this.verifyToken(req, res, next)); // Authenticate asset routes
        assetRouter.post('/:collection/:id', (req, res) => this.storeLargeAsset(req, res));
        assetRouter.get('/:collection/:id', (req, res) => this.loadLargeAsset(req, res));
        this.app.use('/assets', assetRouter);

        // --- Standard JSON Routes ---
        // Apply the JSON body parser with an increased limit for all subsequent routes.
        this.app.use(bodyParser.json({ limit: '10mb' }));

        // Use the BaseEntity verifyToken method for authentication on all subsequent routes
        this.app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
            if (req.path === '/health' || req.path === '/ready') { // Health check already handled, but good practice
                return next();
            }
            this.verifyToken(req, res, next);
        });

        this.app.post('/storeData', (req, res) => this.storeData(req, res));
        this.app.get('/loadData/:id', (req, res) => this.loadData(req, res));
        this.app.get('/loadData', (req, res) => this.loadDataByQuery(req, res));
        this.app.post('/queryData', (req, res) => this.queryData(req, res));
        this.app.get('/getDataHistory/:id', (req, res) => this.getDataHistory(req, res));
        this.app.post('/searchData', (req, res) => this.searchData(req, res));
        this.app.delete('/deleteData/:id', (req, res) => this.deleteData(req, res));
        this.app.post('/storeOutput', (req, res) => this.storeOutput(req, res));
        this.app.get('/loadDeliverable/:stepId', (req, res) => this.loadDeliverable(req, res));
        this.app.get('/loadAllDeliverables/:agentId', (req, res) => this.loadAllDeliverables(req, res));
        this.app.get('/loadStepOutput/:stepId', (req, res) => this.loadStepWorkProduct(req, res));
        this.app.get('/loadAllStepOutputs/:agentId', (req, res) => this.loadAllStepOutputs(req, res));
        this.app.get('/getSavedMissions', (req, res) => this.getSavedMissions(req, res));
        this.app.delete('/deleteCollection', (req, res) => this.deleteCollection(req, res));
        this.app.post('/knowledge/save', (req, res) => this.saveKnowledge(req, res));
        this.app.post('/knowledge/query', (req, res) => this.queryKnowledge(req, res));
      }

      private startServer() {
        const port = parseInt(process.env.PORT || '5040', 10);
        this.app.listen(port, '0.0.0.0', () => {
        console.log(`Librarian listening at http://0.0.0.0:${port}`);
        });
    }

    private async storeLargeAsset(req: express.Request, res: express.Response) {
        const { collection, id } = req.params;
        const assetDir = path.join(LARGE_ASSET_PATH, collection);

        try {
            await fs.promises.mkdir(assetDir, { recursive: true });
            const filePath = path.join(assetDir, id);

            const writeStream = fs.createWriteStream(filePath);
            req.pipe(writeStream);

            writeStream.on('finish', async () => {
                try {
                    const stats = await fs.promises.stat(filePath);
                    const metadata = {
                        _id: id,
                        assetPath: filePath,
                        collection: collection,
                        size: stats.size,
                        createdAt: new Date(),
                        mimeType: req.headers['content-type'] || 'application/octet-stream'
                    };
                    await storeInMongo('asset_metadata', metadata);
                    res.status(201).send({ message: 'Asset stored successfully', id: id, size: stats.size });
                } catch (dbError: any) {
                    console.error(`Failed to store metadata for asset ${id}:`, dbError);
                    await fs.promises.unlink(filePath).catch(e => console.error(`Failed to cleanup asset file ${filePath} after metadata write failure:`, e));
                    res.status(500).send({ error: 'Failed to store asset metadata' });
                }
            });

            writeStream.on('error', (err) => {
                console.error(`Error writing asset stream for ${id}:`, err);
                res.status(500).send({ error: 'Failed to write asset to disk' });
            });

        } catch (error: any) {
            console.error(`Error preparing to store large asset ${id}:`, error);
            res.status(500).send({ error: 'Failed to prepare asset storage location' });
        }
    }

    private async loadLargeAsset(req: express.Request, res: express.Response) {
        const { collection, id } = req.params;
        const assetDir = path.join(LARGE_ASSET_PATH, collection);
        const filePath = path.join(assetDir, id);

        try {
            // Check if the file exists
            await fs.promises.access(filePath, fs.constants.F_OK);

            // Optional: Load metadata to set Content-Type header
            try {
                const metadata = await loadFromMongo('asset_metadata', { _id: id });
                if (metadata && metadata.mimeType) {
                    res.setHeader('Content-Type', metadata.mimeType);
                }
            } catch (metaError) {
                console.warn(`Could not load metadata for asset ${id}, using default content-type. Error:`, metaError);
            }

            const readStream = fs.createReadStream(filePath);
            readStream.pipe(res);

            readStream.on('error', (err) => {
                console.error(`Error streaming asset ${id} to response:`, err);
                res.end();
            });

        } catch (error: any) {
            if (error.code === 'ENOENT') {
                res.status(404).send({ error: 'Asset not found' });
            } else {
                console.error(`Error preparing to load large asset ${id}:`, error);
                res.status(500).send({ error: 'Failed to load asset' });
            }
        }
    }

    private async storeData(req: express.Request, res: express.Response) {
        console.log('storeData called ');

        let { id, data, storageType, collection } = req.body;
        collection = collection || 'mcsdata';

        if (this.isRestrictedCollection(collection) && !this.isCallerAuthorized(req)) {
          return res.status(403).send({ error: 'Access denied to restricted collection' });
        }

        /*if (!id) {
            console.log(`storeData failed: id is ${id === undefined ? 'undefined' : 'null'}`);
            return res.status(400).send({ error: 'ID is required' });
        }*/

        if (!data) {
            console.log(`storeData failed: data is ${data === undefined ? 'undefined' : 'null'} for id ${id}`);
            return res.status(400).send({ error: 'Data is required' });
        }

        try {
            let result;
            if (storageType === 'mongo') {
                const documentToStore = { ...data, _id: id ? id : undefined };
                result = await storeInMongo(collection, documentToStore);
            } else if (storageType === 'redis') {
                id = id || uuidv4();
                result = await storeInRedis(`data:${id}`, JSON.stringify(data));
                result = id;
            } else {
                console.log('storeData failed for invalid storage type');
                return res.status(400).send({ error: 'Invalid storage type' });
            }
            return res.status(200).send({ status: 'Data stored successfully', id: result });
        } catch (error) { analyzeError(error as Error);
            console.error('Error in storeData:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to store data', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async loadData(req: express.Request, res: express.Response) {
        const { id } = req.params;
        const { storageType = 'mongo', collection = 'mcsdata' } = req.query;
        if (this.isRestrictedCollection(collection as string) && !this.isCallerAuthorized(req)) {
          return res.status(403).send({ error: 'Access denied to restricted collection' });
        }
        console.log(`loadData for ${id} requested`)
        if (!id) {
            console.log('loadData failed for no id.')
            return res.status(400).send({ error: 'ID is required' });
        }

        try {
            let data;
            if (storageType === 'redis') {
                data = await loadFromRedis(`data:${id}`);
            } else if (storageType === 'mongo') {
                data = await loadFromMongo(collection as string, {_id: id });
            } else {
                console.log(`loadData failed for invalid storage type: ${storageType}.`);
                return res.status(400).send({ error: 'Invalid storage type' });
            }

            if (!data) {
                console.log(`loadData failed for no data for id ${id}`)
                return res.status(404).send({ error: 'Data not found' });
            }

            res.status(200).send({ data });
        } catch (error) { analyzeError(error as Error);
            console.log('Error in loadData:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to load data', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async storeOutput(req: express.Request, res: express.Response) {
        console.log('storeOutput called ');

        const { agentId, stepId, data, isDeliverable } = req.body;

        if (!agentId) {
            console.log(`storeOutput failed: agentId is ${agentId === undefined ? 'undefined' : 'null'}`);
            return res.status(400).send({ error: 'AgentId is required' });
        }

        if (!stepId) {
            console.log(`storeOutput failed: stepId is ${stepId === undefined ? 'undefined' : 'null'} for agent ${agentId}`);
            return res.status(400).send({ error: 'StepId is required' });
        }

        const stepOutput: WorkProduct = {
            id: `${agentId}_${stepId}`,
            agentId,
            stepId,
            data: data || null,
            timestamp: new Date().toISOString()
        };

        try {
            await storeInMongo('step-outputs', {...stepOutput, _id: stepOutput.id});

            if (isDeliverable) {
                const deliverable: Deliverable = {
                    ...stepOutput,
                    isDeliverable: true
                };
                await storeInMongo('deliverables', {...deliverable, _id: deliverable.id});
            }

            res.status(200).send({ status: 'Output stored' });
        } catch (error) { analyzeError(error as Error);
            console.error('Error storing output:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to store output', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async loadDeliverable(req: express.Request, res: express.Response) {
        console.log('loadDeliverable called ');

        const { stepId } = req.params;

        if (!stepId) {
            console.log(`loadDeliverable failed: stepId is ${stepId === undefined ? 'undefined' : 'null'} in params ${JSON.stringify(req.params)}`);
            return res.status(400).send({ error: 'StepId is required' });
        }

        try {
            const deliverable = await loadFromMongo('deliverables', { stepId: stepId });

            if (!deliverable) {
                return res.status(404).send({ error: 'Deliverable not found' });
            }

            res.status(200).send({ data: deliverable });
        } catch (error) { 
            console.error(`Error loading deliverable for step ${stepId}:`, error instanceof Error ? error.message : String(error));
            res.status(500).send({ error: 'Failed to load deliverable', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async loadStepWorkProduct(req: express.Request, res: express.Response) {
        console.log('loadStepOutput called ');

        const { stepId } = req.params;

        if (!stepId) {
            console.log(`loadStepOutput failed: stepId is ${stepId === undefined ? 'undefined' : 'null'} in params ${JSON.stringify(req.params)}`);
            return res.status(400).send({ error: 'StepId is required' });
        }

        try {
            const stepOutput = await loadFromMongo('step-outputs', { stepId: stepId });

            if (!stepOutput) {
                return res.status(404).send({ error: 'Step output not found' });
            }

            res.status(200).send({ data: stepOutput });
        } catch (error) { 
            console.error(`Error loading step output for step ${stepId}:`, error instanceof Error ? error.message : String(error));
            res.status(500).send({ error: 'Failed to load step output', details: error instanceof Error ? error.message : String(error) });
        }
    }


    private async queryData(req: express.Request, res: express.Response) {
        const { collection, query, limit } = req.body;
        if (this.isRestrictedCollection(collection) && !this.isCallerAuthorized(req)) {
          return res.status(403).send({ error: 'Access denied to restricted collection' });
        }
        console.log('Querying data:', { collection, query, limit });

        if (!collection || !query) {
            console.log(`queryData failed, ${!collection ? 'no collection' : ''} ${!query ? 'no query' : ''}`);
            return res.status(400).send({ error: 'Collection and query are required' });
        }

        try {
            const result = await loadManyFromMongo(collection, query, limit);
            res.status(200).send({ data: result });
        } catch (error) { analyzeError(error as Error);
            console.error('Error querying data:', error instanceof Error ? error.message : String(error));
            res.status(500).send({ error: 'Failed to query data', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async getDataHistory(req: express.Request, res: express.Response) {
        const { id } = req.params;

        if (!id) {
            console.log('getDataHistory failed for no ID');
            return res.status(400).send({ error: 'ID is required' });
        }

        try {
            const history = await loadManyFromMongo('data_versions',{ id });
            res.status(200).send({ history });
        } catch (error) { analyzeError(error as Error);
            res.status(500).send({ error: 'Failed to get data history', details: error instanceof Error ? error.message : String(error) });
        }
    }


    private async searchData(req: express.Request, res: express.Response) {
        const {collection, query = {}, options = {}} = req.body;
        if (this.isRestrictedCollection(collection as string) && !this.isCallerAuthorized(req)) {
          return res.status(403).send({ error: 'Access denied to restricted collection' });
        }
        const parsedOptions = options ? JSON.parse(JSON.stringify(options)) : {};
        // Convert string '1' to number 1 for MongoDB projection
        Object.keys(parsedOptions).forEach(key => {
            parsedOptions[key] = parsedOptions[key] === '1' ? 1 : parsedOptions[key];
        });

        if (collection === undefined) {
            console.log('searchData failed for no collection.');
            return res.status(400).send({ error: 'Collection is required' });
        }
        try {
            const result = await loadManyFromMongo(collection as string, query, parsedOptions);
            res.status(200).send({ data: result });
        } catch (error) { analyzeError(error as Error);
            res.status(500).send({ error: 'Failed to search data', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async deleteData(req: express.Request, res: express.Response) {
        const { id } = req.params;

        if (!id) {
            console.log('deleteData failed for no ID.');
            return res.status(400).send({ error: 'ID is required' });
        }

        try {
            await deleteManyFromMongo('data_versions', { id });
            await deleteFromRedis(`data:${id}`);

            res.status(200).send({ message: 'Data deleted successfully' });
        } catch (error) { analyzeError(error as Error);
            res.status(500).send({ error: 'Failed to delete data', details: error instanceof Error ? error.message : String(error) });
        }
    }


    private async handleMessage(req: express.Request, res: express.Response) {
        const message = req.body;
        console.log('Received message:', message);

        // Process the message based on its content
        // This might involve storing or retrieving data

        res.status(200).send({ status: 'Message received and processed' });
    }

    private async getSavedMissions(req: express.Request, res: express.Response) {
        try {
            const { userId } = req.body;
            const missions = await loadManyFromMongo('missions', { userId: userId }, { projection: { id: 1, name: 1, _id: 0 } });
            res.status(200).send(missions);
        } catch (error) { analyzeError(error as Error);
            res.status(500).send({ error: 'Failed to get saved missions', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async deleteCollection(req: express.Request, res: express.Response) {
        const { collection } = req.query;
        if (this.isRestrictedCollection(collection as string) && !this.isCallerAuthorized(req)) {
          return res.status(403).send({ error: 'Access denied to restricted collection' });
        }
        if (!collection) {
            console.log('deleteCollection failed for no collection.');
            return res.status(400).send({ error: 'Collection is required' });
        }
        try {
            await deleteManyFromMongo(collection as string, {});
            res.status(200).send({ message: 'Collection deleted successfully' });
        } catch (error) { analyzeError(error as Error);
            res.status(500).send({ error: 'Failed to delete collection', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async loadDataByQuery(req: express.Request, res: express.Response) {
        const { storageType = 'mongo', collection = 'mcsdata' } = req.query;
        console.log(`loadData by query: `,req.query);
        try {
            let data;
            if (storageType === 'redis') {
                console.log('loadDataByQuery failed for redis query.');
                return res.status(400).send({ error: 'Redis query not supported for this endpoint' });
            } else if (storageType === 'mongo') {
                // For collections that need to return all items
                if (collection === 'domain_knowledge' || collection === 'knowledge_domains' || collection === 'agent_specializations' || collection === 'agents') {
                    console.log(`Loading all items from ${collection} collection`);
                    data = await loadManyFromMongo(collection as string, {});

                    // If no data is found, return an empty array instead of an error
                    if (!data || (Array.isArray(data) && data.length === 0)) {
                        console.log(`No data found in ${collection} collection, returning empty array`);
                        return res.status(200).send([]);
                    }

                    return res.status(200).send(data);
                } else {
                    console.log('loadDataByQuery failed Please specify an ID or use the queryData endpoint.');
                    return res.status(400).send({ error: 'Please specify an ID or use the queryData endpoint' });
                }
            } else {
                console.log('loadDataByQuery failed for invalid storage type.');
                return res.status(400).send({ error: 'Invalid storage type' });
            }
        } catch (error) { analyzeError(error as Error);
            console.error(`Error loading data from ${collection}:`, error instanceof Error ? error.message : String(error));
            res.status(500).send({ error: 'Failed to load data', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async loadAllDeliverables(req: express.Request, res: express.Response) {
        console.log('loadAllDeliverables called with params:', req.params);

        const { agentId } = req.params;

        if (!agentId) {
            console.log(`loadAllDeliverables failed: agentId is ${agentId === undefined ? 'undefined' : 'null'} in params ${JSON.stringify(req.params)}`);
            return res.status(400).send({ error: 'Agent ID is required' });
        }

        try {
            const deliverables = await loadManyFromMongo('deliverables', { agentId: agentId });

            if (!deliverables || deliverables.length === 0) {
                return res.status(200).send([]);
            }

            res.status(200).send(deliverables);
        } catch (error) { analyzeError(error as Error);
            console.error(`Error loading deliverables for agent ${agentId}:`, error instanceof Error ? error.message : String(error));
            res.status(500).send({ error: 'Failed to load deliverables', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async loadAllStepOutputs(req: express.Request, res: express.Response) {
        console.log('loadAllStepOutputs called with params:', req.params);

        const { agentId } = req.params;

        if (!agentId) {
            console.log(`loadAllStepOutputs failed: agentId is ${agentId === undefined ? 'undefined' : 'null'} in params ${JSON.stringify(req.params)}`);
            return res.status(400).send({ error: 'Agent ID is required' });
        }

        try {
            const stepOutputs = await loadManyFromMongo('step-outputs', { agentId: agentId });

            if (!stepOutputs || stepOutputs.length === 0) {
                return res.status(200).send([]);
            }

            res.status(200).send(stepOutputs);
        } catch (error) { analyzeError(error as Error);
            console.error(`Error loading step outputs for agent ${agentId}:`, error instanceof Error ? error.message : String(error));
            res.status(500).send({ error: 'Failed to load step outputs', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async saveKnowledge(req: express.Request, res: express.Response) {
        const { collectionName, content, metadata } = req.body;

        if (!collectionName || !content) {
            return res.status(400).send({ error: 'collectionName and content are required' });
        }

        try {
            await knowledgeStore.save(collectionName, content, metadata);
            res.status(200).send({ status: 'Knowledge saved successfully' });
        } catch (error) {
            console.error('Error in saveKnowledge:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to save knowledge', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async queryKnowledge(req: express.Request, res: express.Response) {
        const { collectionName, queryText, maxResults } = req.body;

        if (!collectionName || !queryText) {
            return res.status(400).send({ error: 'collectionName and queryText are required' });
        }

        try {
            const results = await knowledgeStore.query(collectionName, queryText, maxResults);
            res.status(200).send({ data: results });
        } catch (error) {
            console.error('Error in queryKnowledge:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to query knowledge', details: error instanceof Error ? error.message : String(error) });
        }
    }
}

// Instantiate the Librarian
new Librarian();
