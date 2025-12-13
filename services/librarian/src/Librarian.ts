import express from 'express';
import axios from 'axios';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { redisCache } from '@cktmcs/shared';
import { storeInMongo, loadFromMongo, loadManyFromMongo, aggregateInMongo, deleteManyFromMongo } from './utils/mongoUtils';
import { WorkProduct, Deliverable } from '@cktmcs/shared';
import { BaseEntity, MapSerializer } from '@cktmcs/shared';
import { ToolSource, PendingTool } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { v4 as uuidv4 } from 'uuid';
import { knowledgeStore } from './knowledgeStore';
import rateLimit from 'express-rate-limit';

const LARGE_ASSET_PATH = process.env.LARGE_ASSET_PATH || '/usr/src/app/shared/librarian-assets';
const ENGINEER_SERVICE_URL = process.env.ENGINEER_SERVICE_URL || 'http://engineer:5050';
const CAPABILITIES_MANAGER_SERVICE_URL = process.env.CAPABILITIES_MANAGER_SERVICE_URL || 'http://capabilitiesmanager:5000';
const MISSIONCONTROL_SERVICE_URL = process.env.MISSIONCONTROL_URL || 'http://missioncontrol:5030';


dotenv.config();

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
      this.startDiscoveryWorker();
    }

    private isRestrictedCollection(collection: string): boolean {
        return false; // Disable restrictions for now
      const restricted = ['users', 'tokens', 'token_blacklist'];
      return restricted.includes(collection.toLowerCase());
    }

    private isCallerAuthorized(req: express.Request): boolean {
      const user = (req as any).user;
      if (!user) return false;
      if (user.sub === 'SecurityManager' || user.componentType === 'SecurityManager') {
        return true;
      }
      // Also allow CapabilitiesManager to register verbs
      if (user.componentType === 'CapabilitiesManager' && user.permissions?.includes('capability:manage')) {
        return true;
      }
      return false;
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
        this.app.post('/deliverable/:stepId', (req, res) => this.storeDeliverable(req, res));
        this.app.get('/loadDeliverable/:stepId', (req, res) => this.loadDeliverable(req, res));
        this.app.get('/loadAllDeliverables/:agentId', (req, res) => this.loadAllDeliverables(req, res));
        this.app.get('/loadWorkProduct/:stepId', (req, res) => this.loadStepWorkProduct(req, res));
        this.app.get('/loadStepOutput/:stepId', (req, res) => this.loadStepWorkProduct(req, res));
        this.app.get('/loadAllStepOutputs/:agentId', (req, res) => this.loadAllStepOutputs(req, res));
        this.app.get('/getSavedMissions', (req, res) => this.getSavedMissions(req, res));
        this.app.delete('/deleteCollection', (req, res) => this.deleteCollection(req, res));
        this.app.post('/tools/index', (req, res) => this.indexTool(req, res));
        this.app.post('/tools/search', (req, res) => this.searchTools(req, res));
        this.app.post('/knowledge/save', (req, res) => this.saveKnowledge(req, res));
        this.app.post('/knowledge/query', (req, res) => this.queryKnowledge(req, res));
        this.app.post('/verbs/register', (req, res) => this.registerVerbForDiscovery(req, res));
        this.app.post('/verbs/discover', (req, res) => this.discoverVerbs(req, res));

        // Tool Source Management
        this.app.post('/tools/sources', (req, res) => this.addToolSource(req, res));
        this.app.get('/tools/sources', (req, res) => this.getToolSources(req, res));
        this.app.delete('/tools/sources/:id', (req, res) => this.deleteToolSource(req, res));

        const discoveryLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // Limit each IP to 100 requests per windowMs
            standardHeaders: true,
            legacyHeaders: false, 
        });

        this.app.post('/verbs/discover', discoveryLimiter, (req, res) => this.discoverVerbs(req, res));
        this.app.post('/tools/search', discoveryLimiter, (req, res) => this.searchTools(req, res));

        // Pending Tool Review
        this.app.get('/tools/pending', (req, res) => this.getPendingTools(req, res));
        this.app.post('/tools/pending/:id/approve', (req, res) => this.approvePendingTool(req, res));
        this.app.post('/tools/pending/:id/reject', (req, res) => this.rejectPendingTool(req, res));
        this.app.put('/tools/:id/status', (req, res) => this.updateToolStatus(req, res));
      }

      private startServer() {
        const port = parseInt(process.env.PORT || '5040', 10);
        this.app.listen(port, '0.0.0.0', () => {
        console.log(`Librarian listening at http://0.0.0.0:${port}`);
        });
        // Keep the process alive
        setInterval(() => {}, 1 << 30);
    }

    private startDiscoveryWorker() {
        const discoveryInterval = parseInt(process.env.TOOL_DISCOVERY_INTERVAL_MS || '300000', 10); // Default to 5 minutes
        console.log(`Starting tool discovery worker with interval: ${discoveryInterval}ms`);
        setInterval(() => this.runDiscovery(), discoveryInterval);
    }

    private async runDiscovery() {
        console.log('Running tool discovery...');
        try {
            const toolSources = await loadManyFromMongo('toolSources', {});
            for (const source of toolSources) {
                console.log(`Processing tool source: ${source.id} (Type: ${source.type}, URL: ${source.url})`);

                let discoveredManifests: any[] = [];

                switch (source.type) {
                    case 'openapi':
                        discoveredManifests = await this.fetchAndParseOpenAPITools(source as ToolSource);
                        break;
                    case 'git':
                        discoveredManifests = await this.fetchAndParseGitTools(source as ToolSource);
                        break;
                    case 'marketplace':
                        discoveredManifests = await this.fetchAndParseMarketplaceTools(source as ToolSource);
                        break;
                    default:
                        console.warn(`Unknown tool source type: ${source.type} for source ${source.id}`);
                        break;
                }

                for (const manifest of discoveredManifests) {
                    // Check if this tool is already pending
                    let existingPendingTool = await loadFromMongo('pendingTools', { id: manifest.id });

                    // Check if the tool is already approved and active in CapabilitiesManager
                    let isToolActiveInCM = false;
                    try {
                        const cmResponse = await axios.get(`${CAPABILITIES_MANAGER_SERVICE_URL}/plugins/${manifest.id}`);
                        if (cmResponse.status === 200 && cmResponse.data) {
                            isToolActiveInCM = true;
                            console.log(`Tool ${manifest.id} is already active in CapabilitiesManager.`);
                        }
                    } catch (cmError) {
                        // If CM returns 404 or other error, it means the tool is not active there
                        console.log(`Tool ${manifest.id} not found in CapabilitiesManager (or CM error): ${cmError instanceof Error ? cmError.message : cmError}`);
                    }

                    if (existingPendingTool) {
                        // Tool is already pending, check for updates
                        if (JSON.stringify(existingPendingTool.manifest_json) !== JSON.stringify(manifest)) {
                            // Manifest has changed, update the pending tool and set status back to pending for re-review
                            existingPendingTool.manifest_json = manifest;
                            existingPendingTool.status = 'pending';
                            existingPendingTool.manifest_url = source.url; // Update manifest URL if it changed
                            await storeInMongo('pendingTools', { ...existingPendingTool, _id: existingPendingTool._id });
                            console.log(`Updated pending tool ${existingPendingTool.id} from source ${source.id} due to manifest change.`);
                        } else {
                            console.log(`Tool ${manifest.id} from source ${source.id} is already pending and manifest is unchanged.`);
                        }
                    } else if (!isToolActiveInCM) {
                        // Tool is not pending and not active in CM, add as new pending tool
                        const newPendingTool: PendingTool = {
                            _id: manifest.id, // Use id as _id for upsert
                            id: manifest.id,
                            source_id: source.id,
                            manifest_url: source.url, // This might need to be more specific for individual tools
                            manifest_json: manifest,
                            status: 'pending',
                        };
                        await storeInMongo('pendingTools', newPendingTool);
                        console.log(`Discovered and added new pending tool ${newPendingTool.id} from source ${source.id}`);
                    } else {
                        // console.debug(`Tool ${manifest.id} from source ${source.id} is already active in CapabilitiesManager and does not require re-approval.`);
                    }
                }

                // Update last_scanned_at
                source.last_scanned_at = new Date();
                await storeInMongo('toolSources', { ...source, _id: source._id || source.id });
            }
            console.log('Tool discovery run complete.');
        } catch (error) {
            console.error('Error during tool discovery run:', error instanceof Error ? error.message : error);
        }
    }

    private async fetchAndParseOpenAPITools(source: ToolSource): Promise<any[]> {
        console.log(`Fetching and parsing OpenAPI spec from: ${source.url}`);
        try {
            const response = await axios.get(source.url);
            const openApiSpec = response.data;
            // In a real scenario, parse the OpenAPI spec to extract tool definitions
            // For now, return a dummy manifest based on the spec
            const dummyManifest = {
                verb: `OPENAPI_TOOL_${source.id}`,
                id: `openapi-tool-${source.id}`,
                explanation: `Tool from OpenAPI spec at ${source.url}`,
                language: 'openapi',
                repository: { type: source.type, url: source.url },
                openApiSpec: openApiSpec // Store the spec for later use by Engineer
            };
            return [dummyManifest];
        } catch (error) {
            console.error(`Failed to fetch or parse OpenAPI spec from ${source.url}:`, error instanceof Error ? error.message : error);
            return [];
        }
    }

    private async fetchAndParseGitTools(source: ToolSource): Promise<any[]> {
        console.log(`Fetching and parsing Git repository for tools from: ${source.url}`);
        // This would involve cloning the repo, scanning for manifest.json files, etc.
        // For now, return a dummy manifest
        const dummyManifest = {
            verb: `GIT_TOOL_${source.id}`,
            id: `git-tool-${source.id}`,
            explanation: `Tool from Git repository at ${source.url}`,
            language: 'git',
            repository: { type: source.type, url: source.url }
        };
        return [dummyManifest];
    }

    private async fetchAndParseMarketplaceTools(source: ToolSource): Promise<any[]> {
        console.log(`Fetching and parsing Marketplace tools from: ${source.url}`);
        // This would involve making an API call to the marketplace service
        // For now, return a dummy manifest
        const dummyManifest = {
            verb: `MARKETPLACE_TOOL_${source.id}`,
            id: `marketplace-tool-${source.id}`,
            explanation: `Tool from Marketplace at ${source.url}`,
            language: 'marketplace',
            repository: { type: source.type, url: source.url }
        };
        return [dummyManifest];
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
                if (id) {
                    try {
                        await redisCache.del(`librarian:${collection}:${id}`);
                    } catch (error) {
                        analyzeError(error as Error);
                    }
                }
            } else if (storageType === 'redis') {
                id = id || uuidv4();
                await redisCache.set(`data:${id}`, data);
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
        const { id } = req.params; // id is optional
        const { storageType = 'mongo', collection = 'mcsdata', query: queryParam } = req.query;
        let query: any = {};

        if (queryParam && typeof queryParam === 'string') {
            try {
                query = JSON.parse(queryParam);
            } catch (parseError) {
                console.warn(`Failed to parse query parameter: ${queryParam}, using empty query.`, parseError);
                return res.status(400).send({ error: 'Invalid JSON format for query parameter.' });
            }
        } else if (id) {
            query._id = id;
        } else {
            // If no id in params and no query param, then request is malformed for this endpoint
            console.log('loadData failed: ID or query parameter is required.');
            return res.status(400).send({ error: 'ID or query parameter is required' });
        }

        if (this.isRestrictedCollection(collection as string) && !this.isCallerAuthorized(req)) {
          return res.status(403).send({ error: 'Access denied to restricted collection' });
        }
        console.log(`loadData for ${id || JSON.stringify(query)} requested from collection ${collection}`)
        
        try {
            let data;
            const cacheKey = `librarian:${collection}:${id || JSON.stringify(query)}`;

            // 1. Try to get from cache first
            if (storageType === 'mongo') { // Only cache mongo requests
                try {
                    data = await redisCache.get(cacheKey);
                    if (data) {
                        console.log(`[Librarian] Cache hit for ${cacheKey}`);
                        return res.status(200).send({ data });
                    }
                } catch (error) {
                    analyzeError(error as Error);
                }
            }
            
            console.log(`[Librarian] Cache miss for ${cacheKey}`);

            if (storageType === 'redis') {
                // Redis specific query is only for direct ID lookup for now.
                if (id) {
                    data = await redisCache.get(`data:${id}`);
                } else {
                    return res.status(400).send({ error: 'Redis query by arbitrary fields not yet supported.' });
                }
            } else if (storageType === 'mongo') {
                if (id) {
                    data = await loadFromMongo(collection as string, {_id: id });
                } else {
                    const results = await loadManyFromMongo(collection as string, query, { limit: 1 });
                    data = results.length > 0 ? results[0] : null;
                }
                
                // 4. Store in cache if found in Mongo
                if (data) {
                    try {
                        await redisCache.set(cacheKey, data);
                    } catch (error) {
                        analyzeError(error as Error);
                    }
                }
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

        if (!stepId) {
            console.log(`storeOutput failed: stepId is required.`);
            return res.status(400).send({ error: 'StepId is required' });
        }

        // The document to be saved in the 'step-outputs' collection.
        // Using stepId as the primary key (_id) for uniqueness and fast lookups.
        const workProductDocument = {
            _id: stepId,
            agentId,
            stepId, // Keep stepId as a queryable field as well
            data: data || null,
            isDeliverable: isDeliverable || false,
            timestamp: new Date().toISOString()
        };

        try {
            await storeInMongo('step-outputs', workProductDocument);
            res.status(200).send({ status: 'Output stored successfully', id: stepId });
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error storing output for step ${stepId}:`, error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to store output', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async storeDeliverable(req: express.Request, res: express.Response) {
        const { stepId } = req.params;
        const { agentId, missionId, originalName, mimeType } = req.query;
        const assetDir = path.join(LARGE_ASSET_PATH, 'deliverables');
        const assetId = uuidv4(); // Generate a unique ID for the file asset
        const filePath = path.join(assetDir, assetId);

        console.log(`Storing deliverable for step ${stepId} with assetId ${assetId}`);

        if (!stepId || !agentId || !missionId || !originalName || !mimeType) {
            return res.status(400).send({ error: 'stepId, agentId, missionId, originalName, and mimeType are required query parameters.' });
        }

        try {
            await fs.promises.mkdir(assetDir, { recursive: true });

            const writeStream = fs.createWriteStream(filePath);
            req.pipe(writeStream);

            writeStream.on('finish', async () => {
                try {
                    const stats = await fs.promises.stat(filePath);

                    // Create the MissionFile object, which is part of the Deliverable
                    const missionFile = {
                        id: assetId,
                        originalName: originalName as string,
                        mimeType: mimeType as string,
                        size: stats.size,
                        storagePath: filePath,
                    };

                    // Create the full Deliverable document
                    const deliverableDocument = {
                        _id: `deliverable-${stepId}`, // Create a unique but predictable ID
                        agentId: agentId as string,
                        stepId: stepId,
                        missionId: missionId as string,
                        isDeliverable: true,
                        missionFile: missionFile,
                        fileContent: null, // Content is on disk, not in the DB document
                        timestamp: new Date().toISOString()
                    };

                    await storeInMongo('deliverables', deliverableDocument);
                    res.status(201).send({ message: 'Deliverable stored successfully', deliverableId: deliverableDocument._id, assetId: assetId });

                } catch (dbError: any) {
                    console.error(`Failed to store metadata for deliverable asset ${assetId}:`, dbError);
                    // Cleanup the orphaned file if the DB write fails
                    await fs.promises.unlink(filePath).catch(e => console.error(`Failed to cleanup asset file ${filePath} after DB failure:`, e));
                    res.status(500).send({ error: 'Failed to store deliverable metadata' });
                }
            });

            writeStream.on('error', (err) => {
                console.error(`Error writing deliverable asset stream for ${assetId}:`, err);
                res.status(500).send({ error: 'Failed to write deliverable asset to disk' });
            });

        } catch (error: any) {
            console.error(`Error preparing to store deliverable asset ${assetId}:`, error);
            res.status(500).send({ error: 'Failed to prepare deliverable storage location' });
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
            await redisCache.del(`data:${id}`);

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

    private async registerVerbForDiscovery(req: express.Request, res: express.Response) {
        if (!this.isCallerAuthorized(req)) {
            return res.status(403).send({ error: 'Access denied: Caller not authorized.' });
        }
        const { id, verb, description, semanticDescription, capabilityKeywords, usageExamples } = req.body;

        if (!id || !verb) {
            return res.status(400).send({ error: 'Verb ID and verb are required for registration.' });
        }

        // Construct content for embedding
        let content = `${verb}: ${description || ''}`;
        if (semanticDescription) {
            content += ` ${semanticDescription}`;
        }
        if (capabilityKeywords && capabilityKeywords.length > 0) {
            content += ` Keywords: ${capabilityKeywords.join(', ')}.`;
        }
        if (usageExamples && usageExamples.length > 0) {
            content += ` Usage examples: ${usageExamples.join('; ')}.`;
        }

        const metadata = {
            id,
            verb,
            description,
            semanticDescription,
            capabilityKeywords,
            usageExamples,
        };

        try {
            await knowledgeStore.save('tools', content, metadata);
            res.status(200).send({ status: `Verb '${verb}' registered for discovery successfully.` });
        } catch (error) {
            console.error('Error in registerVerbForDiscovery:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to register verb for discovery', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async discoverVerbs(req: express.Request, res: express.Response) {
        if (!this.isCallerAuthorized(req)) {
            return res.status(403).send({ error: 'Access denied: Caller not authorized.' });
        }
        const { queryText, maxResults = 1 } = req.body;

        if (!queryText) {
            return res.status(400).send({ error: 'queryText is required for verb discovery.' });
        }

        try {
            let results = await knowledgeStore.query('verbs', queryText, maxResults);
            
            // Filter results based on healthStatus.status
            results = results.filter((result: any) => 
                result.metadata?.healthStatus?.status === 'healthy'
            );

            res.status(200).send({ data: results });
        } catch (error) {
            console.error('Error in discoverVerbs:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to discover verbs', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async indexTool(req: express.Request, res: express.Response) {
        if (!this.isCallerAuthorized(req)) {
            return res.status(403).send({ error: 'Access denied: Caller not authorized.' });
        }
        const { manifest, entities } = req.body;

        if (!manifest || !manifest.verb || !manifest.id) {
            return res.status(400).send({ error: 'Plugin manifest with at least id and verb is required' });
        }

        try {
            // The document to be embedded is a string combining the verb and its explanation.
            const content = `${manifest.verb}: ${manifest.explanation || ''}`;
            
            // The entire manifest is stored as metadata, along with any provided entities.
            const metadata = { ...manifest, id: manifest.id, entities: entities || [], healthStatus: { status: 'healthy' } };

            await knowledgeStore.save('tools', content, metadata);
            res.status(200).send({ status: 'Tool indexed successfully' });
        } catch (error) {
            console.error('Error in indexTool:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to index tool', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async searchTools(req: express.Request, res: express.Response) {
        if (!this.isCallerAuthorized(req)) {
            return res.status(403).send({ error: 'Access denied: Caller not authorized.' });
        }
        const { queryText, maxResults = 1, contextEntities = [] } = req.body;

        if (!queryText) {
            return res.status(400).send({ error: 'queryText is required' });
        }

        try {
            let results = await knowledgeStore.query('tools', queryText, maxResults);
            
            // Filter results based on healthStatus.status
            results = results.filter((result: any) => 
                result.metadata?.healthStatus?.status === 'healthy'
            );

            if (contextEntities.length > 0) {
                // Filter or re-rank results based on contextEntities
                results = results.map((result: any) => {
                    const toolEntities = result.metadata?.entities || [];
                    const commonEntities = contextEntities.filter((entity: string) => toolEntities.includes(entity));
                    const score = commonEntities.length; // Simple overlap score
                    return { ...result, context_score: score };
                });

                // Sort by context_score (descending) then by original distance (ascending)
                results.sort((a: any, b: any) => {
                    if (b.context_score !== a.context_score) {
                        return b.context_score - a.context_score;
                    }
                    return a.distance - b.distance;
                });
            }

            res.status(200).send({ data: results });
        } catch (error) {
            console.error('Error in searchTools:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to search for tools', details: error instanceof Error ? error.message : String(error) });
        }
    }

    // --- Tool Source Management ---
    private async addToolSource(req: express.Request, res: express.Response) {
        const { id, type, url } = req.body;

        if (!id || !type || !url) {
            return res.status(400).send({ error: 'id, type, and url are required' });
        }

        try {
            const newToolSource: ToolSource = { _id: id, id, type, url, last_scanned_at: new Date() };
            await storeInMongo('toolSources', newToolSource);
            res.status(201).send({ status: 'Tool source added successfully', id: newToolSource.id });
        } catch (error) {
            console.error('Error in addToolSource:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to add tool source', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async getToolSources(req: express.Request, res: express.Response) {
        try {
            const toolSources = await loadManyFromMongo('toolSources', {});
            res.status(200).send(toolSources);
        } catch (error) {
            console.error('Error in getToolSources:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to retrieve tool sources', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async deleteToolSource(req: express.Request, res: express.Response) {
        const { id } = req.params;

        if (!id) {
            return res.status(400).send({ error: 'Tool source ID is required' });
        }

        try {
            const result = await deleteManyFromMongo('toolSources', { id });
            if (result.deletedCount === 0) {
                return res.status(404).send({ error: 'Tool source not found' });
            }
            // Also delete any pending tools associated with this source
            await deleteManyFromMongo('pendingTools', { source_id: id });
            res.status(200).send({ status: 'Tool source deleted successfully' });
        } catch (error) {
            console.error('Error in deleteToolSource:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to delete tool source', details: error instanceof Error ? error.message : String(error) });
        }
    }

    // --- Pending Tool Review Management ---
    private async getPendingTools(req: express.Request, res: express.Response) {
        try {
            const pendingTools = await loadManyFromMongo('pendingTools', { status: 'pending' });
            res.status(200).send(pendingTools);
        } catch (error) {
            console.error('Error in getPendingTools:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to retrieve pending tools', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async approvePendingTool(req: express.Request, res: express.Response) {
        const { id } = req.params;
        const { policy_config } = req.body;

        if (!id) {
            return res.status(400).send({ error: 'Pending tool ID is required' });
        }

        try {
            let updatedTool = await loadFromMongo('pendingTools', { id });

            if (!updatedTool || updatedTool.status !== 'pending') {
                return res.status(404).send({ error: 'Pending tool not found or already processed' });
            }

            updatedTool.status = 'approved';
            updatedTool.policy_config = policy_config;
            await storeInMongo('pendingTools', { ...updatedTool, _id: updatedTool._id || updatedTool.id } as PendingTool);

            // Trigger Engineer onboarding process
            try {
                await axios.post(`${ENGINEER_SERVICE_URL}/tools/onboard`, {
                    toolManifest: updatedTool.manifest_json,
                    policyConfig: updatedTool.policy_config,
                });
                console.log(`Engineer service triggered for onboarding tool ${id}`);
            } catch (engineerError) {
                console.error(`Failed to trigger Engineer service for tool ${id}:`, engineerError instanceof Error ? engineerError.message : engineerError);
                // Optionally, revert status or log a critical error if Engineer onboarding is essential
            }

            res.status(200).send({ status: 'Tool approved successfully', tool: updatedTool });
        } catch (error) {
            console.error('Error in approvePendingTool:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to approve pending tool', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async rejectPendingTool(req: express.Request, res: express.Response) {
        const { id } = req.params;

        if (!id) {
            return res.status(400).send({ error: 'Pending tool ID is required' });
        }

        try {
            let updatedTool = await loadFromMongo('pendingTools', { id });

            if (!updatedTool || updatedTool.status !== 'pending') {
                return res.status(404).send({ error: 'Pending tool not found or already processed' });
            }

            updatedTool.status = 'rejected';
            await storeInMongo('pendingTools', { ...updatedTool, _id: updatedTool._id || updatedTool.id } as PendingTool);

            res.status(200).send({ status: 'Tool rejected successfully', tool: updatedTool });
        } catch (error) {
            console.error('Error in rejectPendingTool:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to reject pending tool', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async updateToolStatus(req: express.Request, res: express.Response) {
        const { id } = req.params;
        const { status, reason } = req.body;

        if (!id || !status) {
            return res.status(400).send({ error: 'Tool ID and status are required' });
        }

        try {
            let updatedTool = await loadFromMongo('pendingTools', { id });

            if (!updatedTool) {
                return res.status(404).send({ error: 'Tool not found in pending/approved list.' });
            }

            updatedTool.status = status;
            updatedTool.disabledReason = reason; // Assuming IPendingTool can have a disabledReason
            await storeInMongo('pendingTools', { ...updatedTool, _id: updatedTool._id || updatedTool.id } as PendingTool);

            res.status(200).send({ status: `Tool ${id} status updated to ${status} successfully.`, tool: updatedTool });
        } catch (error) {
            console.error('Error in updateToolStatus:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to update tool status', details: error instanceof Error ? error.message : String(error) });
        }
    }
}

// Instantiate the Librarian
new Librarian();
