import express from 'express';
import axios from 'axios';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { storeInRedis, loadFromRedis, deleteFromRedis } from './utils/redisUtils';
import { storeInMongo, loadFromMongo, loadManyFromMongo, aggregateInMongo, deleteManyFromMongo } from './utils/mongoUtils';
import { WorkProduct } from './types/WorkProduct';
import { BaseEntity, MapSerializer } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';

dotenv.config();

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
        this.app.use(bodyParser.json());
        this.setupRoutes();
        this.startServer();
      }

      private setupRoutes() {
        this.app.post('/storeData', (req: express.Request, res: express.Response) => { this.storeData(req, res)});
        this.app.get('/loadData/:id', (req: express.Request, res: express.Response) => { this.loadData(req, res)} );
        this.app.get('/loadData', (req: express.Request, res: express.Response) => { this.loadDataByQuery(req, res)} );
        this.app.post('/queryData', (req: express.Request, res: express.Response) => { this.queryData(req, res) });
        this.app.get('/getDataHistory/:id', (req: express.Request, res: express.Response) => { this.getDataHistory(req, res)} );
        this.app.post('/searchData', (req: express.Request, res: express.Response) => {this.searchData(req, res)});
        this.app.delete('/deleteData/:id', (req: express.Request, res: express.Response) => { this.deleteData(req, res)});
        this.app.post('/storeWorkProduct', (req: express.Request, res: express.Response) => { this.storeWorkProduct(req, res) });
        this.app.get('/loadWorkProduct/:stepId', (req: express.Request, res: express.Response) => { this.loadWorkProduct(req, res) });
        this.app.get('/loadAllWorkProducts/:agentId', (req: express.Request, res: express.Response) => { this.loadAllWorkProducts(req, res) });
        this.app.get('/getSavedMissions', (req: express.Request, res: express.Response) => { this.getSavedMissions(req, res) });
        this.app.delete('/deleteCollection', (req: express.Request, res: express.Response) => { this.deleteCollection(req, res) });

      }

      private startServer() {
        const port = parseInt(process.env.PORT || '5040', 10);
        this.app.listen(port, '0.0.0.0', () => {
        console.log(`Librarian listening at http://0.0.0.0:${port}`);
        });
    }

    private async storeData(req: express.Request, res: express.Response) {
        console.log('storeData called with body:', JSON.stringify(req.body, null, 2));

        let { id, data, storageType, collection } = req.body;
        collection = collection || 'mcsdata';

        if (!id) {
            console.log(`storeData failed: id is ${id === undefined ? 'undefined' : 'null'}`);
            return res.status(400).send({ error: 'ID is required' });
        }

        if (!data) {
            console.log(`storeData failed: data is ${data === undefined ? 'undefined' : 'null'} for id ${id}`);
            return res.status(400).send({ error: 'Data is required' });
        }

        try {
            let result;
            if (storageType === 'mongo') {
                const documentToStore = { ...data, _id: id };
                result = await storeInMongo(collection, documentToStore);
            } else if (storageType === 'redis') {
                result = await storeInRedis(`data:${id}`, JSON.stringify(data));
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
                console.log('loadData failed for invalid storage type.');
                return res.status(400).send({ error: 'Invalid storage type' });
            }

            if (!data) {
                return res.status(404).send({ error: 'Data not found' });
            }

            res.status(200).send({ data });
        } catch (error) { analyzeError(error as Error);
            res.status(500).send({ error: 'Failed to load data', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async storeWorkProduct(req: express.Request, res: express.Response) {
        console.log('storeWorkProduct called with body:', JSON.stringify(req.body, null, 2));

        const { agentId, stepId, data } = req.body;

        if (!agentId) {
            console.log(`storeWorkProduct failed: agentId is ${agentId === undefined ? 'undefined' : 'null'}`);
            return res.status(400).send({ error: 'AgentId is required' });
        }

        if (!stepId) {
            console.log(`storeWorkProduct failed: stepId is ${stepId === undefined ? 'undefined' : 'null'} for agent ${agentId}`);
            return res.status(400).send({ error: 'StepId is required' });
        }

        const workProduct: WorkProduct = {
            id: `${agentId}_${stepId}`,
            agentId,
            stepId,
            data: data || null,
            timestamp: new Date().toISOString()
        };
        console.log(`Creating work product with ID: ${workProduct.id}, agentId: ${agentId}, stepId: ${stepId}`);
        try {
            const id = await storeInMongo('workProducts', {...workProduct, _id: workProduct.id});
            res.status(200).send({ status: 'Work product stored', id: id });
        } catch (error) { analyzeError(error as Error);
            console.error('Error storing work product:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to store work product', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async loadWorkProduct(req: express.Request, res: express.Response) {
        console.log('loadWorkProduct called with params:', req.params);

        const { stepId } = req.params;

        if (!stepId) {
            console.log(`loadWorkProduct failed: stepId is ${stepId === undefined ? 'undefined' : 'null'} in params ${JSON.stringify(req.params)}`);
            return res.status(400).send({ error: 'StepId is required' });
        }

        try {
            const workProduct = await loadFromMongo('workProducts', { stepId: stepId });

            if (!workProduct) {
                return res.status(404).send({ error: 'Work product not found' });
            }

            res.status(200).send({ data: workProduct });
        } catch (error) { analyzeError(error as Error);
            res.status(500).send({ error: 'Failed to load work product', details: error instanceof Error ? error.message : String(error) });
        }
    }


    private async queryData(req: express.Request, res: express.Response) {
        const { collection, query, limit } = req.body;
        //console.log('Querying data:', { collection, query, limit });

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
                }w
            } else {
                console.log('loadDataByQuery failed for invalid storage type.');
                return res.status(400).send({ error: 'Invalid storage type' });
            }
        } catch (error) { analyzeError(error as Error);
            console.error(`Error loading data from ${collection}:`, error instanceof Error ? error.message : String(error));
            res.status(500).send({ error: 'Failed to load data', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async loadAllWorkProducts(req: express.Request, res: express.Response) {
        console.log('loadAllWorkProducts called with params:', req.params);

        const { agentId } = req.params;

        if (!agentId) {
            console.log(`loadAllWorkProducts failed: agentId is ${agentId === undefined ? 'undefined' : 'null'} in params ${JSON.stringify(req.params)}`);
            return res.status(400).send({ error: 'Agent ID is required' });
        }

        try {
            const workProducts = await loadManyFromMongo('workProducts', { agentId: agentId });

            if (!workProducts || workProducts.length === 0) {
                return res.status(200).send([]);
            }

            res.status(200).send(workProducts);
        } catch (error) { analyzeError(error as Error);
            console.error(`Error loading work products for agent ${agentId}:`, error instanceof Error ? error.message : String(error));
            res.status(500).send({ error: 'Failed to load work products', details: error instanceof Error ? error.message : String(error) });
        }
    }
}

// Instantiate the Librarian
new Librarian();
