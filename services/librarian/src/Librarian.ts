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
        this.app.post('/queryData', (req: express.Request, res: express.Response) => { this.queryData(req, res) });
        this.app.get('/getDataHistory/:id', (req: express.Request, res: express.Response) => { this.getDataHistory(req, res)} );
        this.app.post('/searchData', (req: express.Request, res: express.Response) => {this.searchData(req, res)});
        this.app.delete('/deleteData/:id', (req: express.Request, res: express.Response) => { this.deleteData(req, res)});
        this.app.post('/storeWorkProduct', (req: express.Request, res: express.Response) => { this.storeWorkProduct(req, res) });
        this.app.get('/loadWorkProduct/:id', (req: express.Request, res: express.Response) => { this.loadWorkProduct(req, res) });    
        this.app.get('/librarian/retrieve/:id', (req: express.Request, res: express.Response) =>  { this.retrieveWorkProduct(req, res)});
        this.app.get('/getSavedMissions', (req: express.Request, res: express.Response) => { this.getSavedMissions(req, res) });
        
      }

      private startServer() {
        const port = process.env.PORT || 5040;
        this.app.listen(port, () => {
        console.log(`Librarian listening at http://localhost:${port}`);
        });
    }


    private async retrieveWorkProduct(req: express.Request, res: express.Response) {
        const { id } = req.params;
        console.log('Retrieving work product:', id);
        if (!id) {
          return res.status(400).send({ error: 'Work product step ID is required' });
        }
    
        try {
          const workProduct = await loadFromMongo('workProducts', { stepId: id });
    
          if (!workProduct) {
            console.log('Work product not found:', id);
            return res.status(404).send({ error: 'Work product not found' });
          }
          console.log('Work product retrieved:', workProduct);
          res.status(200).send(workProduct);
        } catch (error) { analyzeError(error as Error);
          res.status(500).send({ error: 'Failed to retrieve work product', details: error instanceof Error ? error.message : String(error) });
        }
      }
    
    private async storeData(req: express.Request, res: express.Response) {
    
        let { id, data, storageType, collection } = req.body;
        console.log('Storing data:', req.body);
        collection = collection || 'mcsdata';
    
  
        if (!id || !data) {
            return res.status(400).send({ error: 'ID and data are required' });
        }
    
        try {
            if (storageType === 'mongo') {
                const result = await storeInMongo(collection, data);
                console.log('Result of storeInMongo: ', result);
            } else if (storageType === 'redis') {
                await storeInRedis(`data:${id}`, JSON.stringify(data));
            } else {
                return res.status(400).send({ error: 'Invalid storage type' });
            }
        } catch (error) { analyzeError(error as Error);
            console.error('Error in storeData:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to store data', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async loadData(req: express.Request, res: express.Response) {
        const { id } = req.params;
        const { storageType, collection = 'mcsdata' } = req.query;

        if (!id) {
            return res.status(400).send({ error: 'ID is required' });
        }

        try {
            let data;
            if (storageType === 'redis') {
                data = await loadFromRedis(`data:${id}`);
            } else if (storageType === 'mongo') {
                data = await loadFromMongo(collection as string, {_id: id });
            } else {
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
        const { agentId, stepId, data } = req.body;
        console.log('Storing work product:', req.body);
    
        if (!agentId || !stepId ) {
            return res.status(400).send({ error: 'AgentId, StepId, and type are required' });
        }
    
        const workProduct: WorkProduct = {
            id: `${agentId}_${stepId}`,
            agentId,
            stepId,
            data: MapSerializer.transformForSerialization(data || null),
            timestamp: new Date().toISOString()
        };
    
        try {
            const id = await storeInMongo('workProducts', workProduct);
            res.status(200).send({ status: 'Work product stored', id: id });
        } catch (error) { analyzeError(error as Error);
            console.error('Error storing work product:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to store work product', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async loadWorkProduct(req: express.Request, res: express.Response) {
        const { stepId } = req.params;

        if (!stepId) {
            return res.status(400).send({ error: 'ID is required' });
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
        const collection = req.query.collection;
        const query = req.query.query || {};
        const options = req.query.options || {};
        const parsedOptions = options ? JSON.parse(JSON.stringify(options)) : {};
        // Convert string '1' to number 1 for MongoDB projection
        Object.keys(parsedOptions).forEach(key => {
            parsedOptions[key] = parsedOptions[key] === '1' ? 1 : parsedOptions[key];
        });

        console.log(`Searching ${collection} for options:`, parsedOptions);
        if (collection === undefined) {
            return res.status(400).send({ error: 'Collection is required' });
        } 
        try {
            const result = await loadManyFromMongo(collection as string, query, parsedOptions);
            console.log(`Search result:`, result);
            res.status(200).send({ data: result });
        } catch (error) { analyzeError(error as Error);
            res.status(500).send({ error: 'Failed to search data', details: error instanceof Error ? error.message : String(error) });
        }
    }

    private async deleteData(req: express.Request, res: express.Response) {
        const { id } = req.params;

        if (!id) {
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
    
}

// Instantiate the Librarian
new Librarian();
