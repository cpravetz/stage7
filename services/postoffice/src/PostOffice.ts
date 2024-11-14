import express from 'express';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import WebSocket from 'ws';
import http from 'http';
import { Component } from './types/Component';
import { Message, MessageType } from '@cktmcs/shared';
import axios from 'axios';
import { analyzeError } from '@cktmcs/errorhandler';


const api = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });

  
export class PostOffice {
    private app: express.Express;
    private server: http.Server;
    private components: Map<string, Component> = new Map();
    private componentsByType: Map<string, Set<string>> = new Map();
    private wss: WebSocket.Server;
    private clients: Map<string, WebSocket> = new Map();
    private userInputRequests: Map<string, (response: any) => void> = new Map();
    private messageQueue: Map<string, Message[]> = new Map();
    private subscriptions: Map<string, Set<string>> = new Map();
    private messageProcessingInterval: NodeJS.Timeout;
    private securityManagerUrl: string = process.env.SECURITYMANAGER_URL || 'securitymanager:5010';
    private url: string;


    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });
        this.url = process.env.POSTOFFICE_URL || 'postoffice:5020';
        this.setupWebSocket();
        const corsOptions = {
            origin: true, // This allows all origins
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Allow-Origin', 'Access-Control-Allow-Headers'],
            credentials: true,
        };

        this.app.use(cors(corsOptions));

        this.app.use(express.json());
        this.app.use(this.logRequest);

        // Explicitly set CORS headers for all routes
        this.app.use((req, res, next) => {
            const origin = req.headers.origin || '*'; // This allows all origins
            res.header('Access-Control-Allow-Origin', origin); // Replace with your frontend's actual origin
            res.header('Access-Control-Allow-Credentials', 'true');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
            next();
        });        

        // Add OPTIONS handler for preflight requests
        this.app.options('*', cors(corsOptions));

        // Add a simple GET handler for the root path
        this.app.get('/', (req, res) => {
            res.send('PostOffice service is running');
        });

        this.app.post('/message', (req, res) => this.handleMessage(req, res));

        this.app.post('/sendMessage', (req, res) => {
            console.log('Received message:', req.body);
            this.handleIncomingMessage(req, res);
        });

        this.app.use('/securityManager/*', async (req, res, next) => { this.routeSecurityRequest(req, res, next); });
        this.app.post('/registerComponent', (req, res) => this.registerComponent(req, res));
        this.app.get('/requestComponent', (req, res) => this.requestComponent(req, res));
        this.app.get('/getServices', (req, res) => this.getServices(req, res)); 
        this.app.post('/submitUserInput', (req, res) => this.submitUserInput(req, res));
        this.app.post('/createMission', (req, res) => { this.createMission(req, res) });
        this.app.post('/loadMission', (req, res) => this.loadMission(req, res));
        this.app.get('/librarian/retrieve/:id', (req, res) => this.retrieveWorkProduct(req, res));
        this.app.get('/getSavedMissions', (req, res) => { this.getSavedMissions(req, res)} );

        const port = parseInt(process.env.PORT || '5020', 10);
        this.server.listen(port, '0.0.0.0', () => {
            console.log(`PostOffice listening on all interfaces at port ${port}`);
        });
        this.messageProcessingInterval = setInterval(() => this.processMessageQueue(), 100);
    }


    private async retrieveWorkProduct(req: express.Request, res: express.Response) {
        try {
            const librarianUrl = this.getComponentUrl('Librarian');
            if (!librarianUrl) {
                throw new Error('Librarian not registered');
            }
            const response = await api.get(`http://${librarianUrl}/loadWorkProduct/${req.params.id}`);
            res.status(200).send(response.data);
        }
        catch (error) { analyzeError(error as Error);
            console.error('Error retrieving work product:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to retrieve work product' });
        }
    }

    private logRequest = (req: express.Request, res: express.Response, next: express.NextFunction) => {
        console.log(`${req.method} ${req.url}`);
        next();
    }

    private setupWebSocket() {
        this.wss.on('connection', async (ws: WebSocket, req: http.IncomingMessage) => {
            const url = new URL(req.url!, `http://${req.headers.host}`);
            const clientId = url.searchParams.get('clientId');
            const token = url.searchParams.get('token');
    
            if (!clientId || !token) {
                console.error('Client ID or token missing');
                ws.close(1008, 'Client ID or token missing');
                return;
            }
    
            const isValid = await this.verifyToken(clientId, token);
            if (!isValid) {
                console.error(`Invalid token for client ${clientId}`);
                ws.close(1008, 'Invalid token');
                return;
            }

            this.clients.set(clientId, ws);
            console.log(`Client ${clientId} connected`);
    
            ws.on('message', (message: string) => {
                try {
                    const parsedMessage = JSON.parse(message);
                    if (parsedMessage.type === MessageType.CLIENT_CONNECT) {
                        console.log(`Client ${parsedMessage.clientId} confirmed connection`);
                    } else {
                        this.handleWebSocketMessage(parsedMessage, token || '');
                    }
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error instanceof Error ? error.message : error);
                }
            });
    
            ws.on('close', () => {
                console.log(`Client ${clientId} disconnected`);
                this.clients.delete(clientId);
            });
    
            // Send a connection confirmation message
            ws.send(JSON.stringify({ type: 'CONNECTION_CONFIRMED', clientId }));
        });
    }

    private handleMessage = async (req: express.Request, res: express.Response) => {
        const message: Message = req.body;
        await this.routeMessage(message);
        res.status(200).send({ status: 'Message queued for processing' });
    }

    private async routeMessage(message: Message) {
        console.log('Routing message:', message);
        const { clientId } = message;
        if (message.type === MessageType.STATISTICS) {
            if (!clientId) {
                console.error('No clientId in statistics update message:', message);
                return;
            }
            console.log('Routing statistics update to client:', clientId);
            this.sendToClient(clientId, message);
            return;
        }
        
        if (message.recipient === 'user') {
            if (clientId) {
                this.sendToClient(clientId, message);
                return;
            } else {
                this.broadcastToClients(message);
            }
        } else {
            const recipientId = message.recipient;
            if (!recipientId) {
                console.error('No recipient specified for message:', message);
                return;
            }
            if (!this.messageQueue.has(recipientId)) {
                this.messageQueue.set(recipientId, []);
            }
            this.messageQueue.get(recipientId)!.push(message);
        }
    }

    private sendToClient(clientId: string, message: any) {
        const client = this.clients.get(clientId);
        if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        } else {
            console.error(`Client ${clientId} not found or not ready`);
        }
    }

    private broadcastToClients(message: any) {
        this.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    }    


    private async processMessageQueue() {
        for (const [recipientId, messages] of this.messageQueue.entries()) {
            if (recipientId === 'user') {
                while (messages.length > 0) {
                    const message = messages.shift()!;
                    this.broadcastToClients(message);
                }
            } else {
                const component = this.components.get(recipientId);
                if (component && messages.length > 0) {
                    const message = messages.shift()!;
                    try {
                        await api.post(`http://${component.url}/message`, message);
                    } catch (error) { analyzeError(error as Error);
                        console.error(`Failed to deliver message to ${recipientId}:`, error instanceof Error ? error.message : error);
                        messages.unshift(message); // Put the message back in the queue
                    }
                }
            }
        }
    }

    private async createMission(req: express.Request, res: express.Response) {
        const { goal, clientId } = req.body;
        const token = req.headers.authorization;
    
        console.log(`PostOffice has request to createMission for goal`, goal);
        
        if (!token) {
            return res.status(401).json({ error: 'No authorization token provided' });
        }
    
        try {
            const missionControlUrl = this.getComponentUrl('MissionControl');
            if (!missionControlUrl) {
                throw new Error('MissionControl not registered');
            }
    
            // Pass the exact same token format received from the client
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': token  // Don't modify the token, pass it as-is
            };
    
            const response = await api.post(`http://${missionControlUrl}/message`, {
                type: MessageType.CREATE_MISSION,
                sender: 'PostOffice',
                recipient: 'MissionControl',
                clientId,
                content: {
                    goal
                },
                timestamp: new Date().toISOString()
            }, { headers });
    
            res.status(200).send(response.data);
        } catch (error) { analyzeError(error as Error);
            console.error('Error creating mission:', error instanceof Error ? error.message : error);
            if (axios.isAxiosError(error) && error.response) {
                // More detailed error handling
                const status = error.response.status;
                const errorMessage = error.response.data?.error || 'Unknown error occurred';
                
                // Pass through the actual error status from MissionControl
                res.status(status).json({ 
                    error: errorMessage,
                    details: error.response.data 
                });
            } else {
                res.status(503).json({ error: 'Internal server error' });
            }
        }
    }

    private async loadMission(req: express.Request, res: express.Response) {
        const { missionId, clientId } = req.body;
        try {
            const missionControlUrl = this.getComponentUrl('MissionControl');
            if (!missionControlUrl) {
                throw new Error('MissionControl not registered');
            }
            const response = await api.post(`http://${missionControlUrl}/loadMission`, { missionId, clientId });
            res.status(200).send(response.data);
        } catch (error) { analyzeError(error as Error);
            console.error('Error loading mission:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to load mission' });
        }
    }

    private async registerComponent(req: express.Request, res: express.Response) {
        const { id, type, url } = req.body;
        
        try {

            const component: Component = { id, type, url };
            this.components.set(id, component);

            if (!this.componentsByType.has(type)) {
                this.componentsByType.set(type, new Set());
            }
            this.componentsByType.get(type)!.add(id);

            console.log(`Component registered: ${id} of type ${type}`);
            res.status(200).send({ message: 'Component registered successfully' });
        } catch (error) { analyzeError(error as Error);
            console.error('Component registration failed:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to register component' });
        }
    }
    
    private requestComponent(req: express.Request, res: express.Response) {
        const { id, type } = req.query;

        if (id) {
            const component = Array.from(this.components.values()).find(c => c.id === id);
            if (component) {
                res.status(200).send({ component });
            } else {
                res.status(404).send({ error: 'Component not found' });
            }
        } else if (type) {
            const componentIds = this.componentsByType.get(type as string);
            if (componentIds && componentIds.size > 0) {
                const matchingComponents = Array.from(componentIds)
                    .map(id => this.components.get(id))
                    .filter(component => component !== undefined);
                res.status(200).send({ components: matchingComponents });
            } else {
                res.status(404).send({ error: 'No components of this type found' });
            }
        } else {
            res.status(400).send({ error: 'Either guid or type must be provided' });
        }
    }

    private async handleIncomingMessage(req: express.Request, res: express.Response) {
        const message: Message = req.body;
        const token = req.headers.authorization || '';

        try {
            const recipientUrl = await this.discoverService(message.recipient);
            if (!recipientUrl) {
                res.status(404).send({ error: `Recipient not found for ${JSON.stringify(message.recipient)}` });
                return;
            }
            await this.sendToComponent(`${recipientUrl}/message`, message, token);
            res.status(200).send({ status: 'Message sent' });
        } catch (error) { analyzeError(error as Error);
            console.error('Error sending message:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to send message' });
        }
    }
    
    private async handleWebSocketMessage(message: string, token: string) {
        try {
            let parsedMessage: Message;
            
            // Check if the message is already an object
            if (typeof message === 'object' && message !== null) {
                parsedMessage = message as Message;
            } else {
                // If it's a string, try to parse it
                parsedMessage = JSON.parse(message);
            }
    
            console.log('WebSocket message received:', parsedMessage);
            console.log('Looking for client:', parsedMessage.recipient);
            const recipientUrl = await this.discoverService(parsedMessage.recipient);
            if (!recipientUrl) {
                console.error(`(ws)Recipient not found for ${JSON.stringify(parsedMessage)}`);
                return;
            }
            await this.sendToComponent(recipientUrl, parsedMessage, token);
        } catch (error) { analyzeError(error as Error);
            console.error('Error handling WebSocket message:', error instanceof Error ? error.message : error);
            console.error('Raw message:', message);
        }
    }
    
    private async discoverService(type: string): Promise<string | undefined> {
        const services = Array.from(this.components.entries())
            .filter(([_, service]) => service.type === type)
            .map(([gid, service]) => ({ gid, ...service }));
        
        if (services.length === 0) {
            return undefined;
        }
        return services[0].url;
    }
    
    private async sendToComponent(url: string, message: Message, token: string): Promise<void> {
        try {
            // Ensure the URL has a protocol
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = `http://${url}`;
            }
            message.type = message.type || message.content.type;
            console.log(`Sending message to: ${url}: ${message}`);            
            await api.post(url, message, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token // Forward the token
                }
            });
        } catch (error) { analyzeError(error as Error);
            console.error(`Failed to send message to ${url}:`, error instanceof Error ? error.message : error);
            throw error;
        }
    }
    private getServices(req: express.Request, res: express.Response) {
        const services = {
            capabilitiesManagerUrl: this.getComponentUrl('CapabilitiesManager'),
            brainUrl: this.getComponentUrl('Brain'),
            trafficManagerUrl: this.getComponentUrl('TrafficManager'),
            librarianUrl: this.getComponentUrl('Librarian'),
            missionControlUrl: this.getComponentUrl('MissionControl'),
            engineerUrl: this.getComponentUrl('Engineer')
        };
        res.status(200).json(services);
    }

    private getComponentUrl(type: string): string | undefined {
        const componentGuids = this.componentsByType.get(type);
        if (componentGuids && componentGuids.size > 0) {
            const randomGuid = Array.from(componentGuids)[0]; // Get the first registered component of this type
            const component = this.components.get(randomGuid);
            return component?.url;
        }
        return undefined;
    }

    private submitUserInput(req: express.Request, res: express.Response) {
        const { requestId, response } = req.body;
        const resolver = this.userInputRequests.get(requestId);

        if (resolver) {
            resolver(response);
            this.userInputRequests.delete(requestId);
            res.status(200).send({ message: 'User input received' });
        } else {
            res.status(404).send({ error: 'User input request not found' });
        }
    }
    private async getSavedMissions(req: express.Request, res: express.Response) {
        try {
            const librarianUrl = this.getComponentUrl('Librarian');
            if (!librarianUrl) {
                throw new Error('Librarian not registered');
            }
            
            // Extract user ID from the JWT token
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) {
                return res.status(401).send({ error: 'No token provided' });
            }
    
            const decodedToken = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
            const userId = decodedToken.id;
    
            const response = await api.get(`http://${librarianUrl}/getSavedMissions`, {
                params: { userId }
            });
            res.status(200).send(response.data);
        } catch (error) { analyzeError(error as Error);
            console.error('Error getting saved missions:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to get saved missions' });
        }
    }
   
    private async routeSecurityRequest(req: express.Request, res: express.Response, next: express.NextFunction) {
        if (!this.securityManagerUrl) {
            res.status(503).json({ error: 'SecurityManager not registered yet' });
            return next();
        }
    
        console.log('Original URL:', req.originalUrl);
        
        const securityManagerPath = req.originalUrl.split('/securityManager')[1] || '/';
        const fullUrl = `http://${this.securityManagerUrl}${securityManagerPath}`;
        console.log(`Forwarding request to SecurityManager: ${fullUrl}`);
    
        try {
            const response = await axios({
                method: req.method,
                url: fullUrl,
                data: req.body,
                headers: req.headers,
                params: req.query
            });
    
            // Log the response from SecurityManager
            console.log('Response from SecurityManager:', response.data);
    
            // Send the response back to the client
            res.status(response.status).json(response.data);
        } catch (error) { analyzeError(error as Error);
            console.error(`Error forwarding request to SecurityManager:`, error instanceof Error ? error.message : error);
            if (axios.isAxiosError(error) && error.response) {
                // If it's an Axios error with a response, send that response to the client
                res.status(error.response.status).json(error.response.data);
            } else {
                // For other types of errors, send a generic error message
                res.status(500).json({ error: 'Internal server error' });
            }
        }
    }

    private async verifyToken(clientId: string, token: string): Promise<boolean> {
        try {
          const response = await axios.post(`http://${this.securityManagerUrl}/auth/verify`, { token }, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          return response.data.valid;
        } catch (error) {
          console.error(`Error verifying token for client ${clientId}:`, error);
          return false;
        }
      }
}

new PostOffice();