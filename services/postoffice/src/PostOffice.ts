import express from 'express';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import WebSocket from 'ws';
import http from 'http';
import { Component } from './types/Component';
import { Message, MessageType, MessageQueueClient, ServiceDiscovery, ServiceTokenManager, BaseEntity } from '@cktmcs/shared';
import axios from 'axios';
import { analyzeError } from '@cktmcs/errorhandler';
import bodyParser from 'body-parser';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';

const api = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });


export class PostOffice extends BaseEntity {
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


    constructor() {
        // Call the BaseEntity constructor with required parameters
        const id = uuidv4();
        const componentType = 'PostOffice';
        const urlBase = process.env.POSTOFFICE_URL || 'postoffice';
        const port = process.env.PORT || '5020';
        super(id, componentType, urlBase, port);
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });

        this.setupWebSocket();

        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 1000, // max 100 requests per windowMs
        });
        this.app.use(limiter);

        const corsOptions = {
            origin: true, // This allows all origins
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Allow-Origin', 'Access-Control-Allow-Headers'],
            credentials: true,
        };
        this.app.use(cors(corsOptions));

        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));

        // Add OPTIONS handler for preflight requests
        this.app.options('*', cors(corsOptions));

        // Add a simple GET handler for the root path
        this.app.get('/', (req, res) => {
            res.send('PostOffice service is running');
        });

        // Allow registration without authentication
        this.app.post('/registerComponent', (req, res) => {
            console.log('Received registration request:', req.body);
            this.registerComponent(req, res);
        });

        // Add routes with authentication
        this.app.post('/message', (req, res) => this.handleMessage(req, res));
        this.app.post('/sendMessage', (req, res) => this.handleIncomingMessage(req, res));
        this.app.use('/securityManager/*', async (req, res, next) => this.routeSecurityRequest(req, res, next));
        this.app.get('/requestComponent', (req, res) => this.requestComponent(req, res));
        this.app.get('/getServices', (req, res) => this.getServices(req, res));
        this.app.post('/submitUserInput', (req, res) => this.submitUserInput(req, res));
        this.app.post('/createMission', (req, res) => this.createMission(req, res));
        this.app.post('/loadMission', (req, res) => this.loadMission(req, res));
        this.app.get('/librarian/retrieve/:id', (req, res) => this.retrieveWorkProduct(req, res));
        this.app.get('/getSavedMissions', (req, res) => this.getSavedMissions(req, res));

        // Use the port from BaseEntity
        const serverPort = parseInt(this.port, 10);
        this.server.listen(serverPort, '0.0.0.0', () => {
            console.log(`PostOffice listening on all interfaces at port ${serverPort}`);
        });
        this.messageProcessingInterval = setInterval(() => this.processMessageQueue(), 100);
    }


    private async retrieveWorkProduct(req: express.Request, res: express.Response) {
        try {
            const librarianUrl = this.getComponentUrl('Librarian');
            if (!librarianUrl) {
                res.status(404).send({ error: 'Librarian not registered' });
            }
            const response = await api.get(`http://${librarianUrl}/loadWorkProduct/${req.params.id}`);
            res.status(200).send(response.data);
        }
        catch (error) {
            analyzeError(error as Error);
            console.error('Error retrieving work product:', error instanceof Error ? error.message : error, 'id:',req.params.id);
            res.status(500).send({ error: `Failed to retrieve work product id:${req.params.id}`});
        }
    }

    protected setupHealthCheck() {
        // Basic health check endpoint
        this.app.get('/health', (_req, res) => {
            const rabbitMQConnected = this.mqClient && this.mqClient.isConnected();
            const status = {
                status: rabbitMQConnected ? 'ok' : 'degraded',
                timestamp: new Date().toISOString(),
                services: {
                    rabbitMQ: rabbitMQConnected ? 'connected' : 'disconnected',
                    serviceDiscovery: this.serviceDiscovery?.isRegistered('PostOffice') ? 'registered' : 'not registered',
                    components: this.components.size
                },
                ready: rabbitMQConnected
            };

            res.status(rabbitMQConnected ? 200 : 503).json(status);
        });

        // Readiness check endpoint - returns 200 only when fully ready to accept connections
        this.app.get('/ready', (_req, res) => {
            const rabbitMQConnected = this.mqClient && this.mqClient.isConnected();
            const serviceDiscoveryReady = this.serviceDiscovery?.isRegistered('PostOffice');
            const ready = rabbitMQConnected && serviceDiscoveryReady;

            if (ready) {
                res.status(200).json({ ready: true });
            } else {
                res.status(503).json({
                    ready: false,
                    rabbitMQ: rabbitMQConnected ? 'connected' : 'disconnected',
                    serviceDiscovery: serviceDiscoveryReady ? 'registered' : 'not registered'
                });
            }
        });
    }

    protected async handleQueueMessage(message: Message) {
        console.log('Received message from queue:', message);
        if (message.type && message.recipient) {
            await this.routeMessage(message);
        } else {
            console.error('Invalid message format received from queue:', message);
        }
    }

    private setupWebSocket() {
        this.wss.on('connection', async (ws: WebSocket, req: http.IncomingMessage) => {
            console.log('New WebSocket connection attempt');
            const url = new URL(req.url!, `http://${req.headers.host}`);
            const clientId = url.searchParams.get('clientId');
            const token = url.searchParams.get('token');

            console.log(`WebSocket connection attempt - ClientID: ${clientId}, Token: ${token}`);

            if (!clientId || !token || (token === null)) {
                console.log('Client ID or token missing');
                ws.close(1008, 'Client ID or token missing');
                return;
            }

            const isValid = await this.validateClientConnection(clientId, token);
            if (!isValid) {
                console.log(`Invalid token for client ${clientId}`);
                ws.close(1008, 'Invalid token');
                return;
            }
            this.clients.set(clientId, ws);
            console.log(`Client ${clientId} connected successfully`);

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

    protected handleMessage = async (req: express.Request, res: express.Response) => {
        const message: Message = req.body;
        await this.routeMessage(message);
        res.status(200).send({ status: 'Message queued for processing' });
    }

    /**
     * Route a message to its recipient
     * @param message Message to route
     */
    private async routeMessage(message: Message) {
        console.log('Routing message:', message);
        const { clientId } = message;

        // Handle statistics messages (always sent directly to clients)
        if (message.type === MessageType.STATISTICS) {
            if (!clientId) {
                console.error('No clientId in statistics update message:', message);
                return;
            }
            console.log('Routing statistics update to client:', clientId);
            this.sendToClient(clientId, message);
            return;
        }

        // Handle messages to users (via WebSocket)
        if (message.recipient === 'user') {
            if (clientId) {
                this.sendToClient(clientId, message);
                return;
            } else {
                this.broadcastToClients(message);
                return;
            }
        }

        // Handle messages to services
        const recipientId = message.recipient;
        if (!recipientId) {
            console.error('No recipient specified for message:', message);
            return;
        }

        // Check if this is a synchronous message that requires immediate response
        const requiresSync = message.requiresSync ||
                            message.type === MessageType.REQUEST ||
                            message.type === MessageType.RESPONSE;

        // Always try to use RabbitMQ first, even for synchronous messages
        try {
            const routingKey = `message.${recipientId}`;

            if (this.mqClient && requiresSync && message.sender && (message as any).replyTo) {
                // For synchronous messages with replyTo, just publish with correlation ID
                await this.mqClient.publishMessage('stage7', routingKey, message);
                console.log(`Published sync message to queue with routing key: ${routingKey}`);
                return;
            } else if (requiresSync) {
                // For synchronous messages without replyTo, use RPC pattern
                // Add replyTo and correlationId to the message
                const correlationId = Math.random().toString() + Date.now().toString();
                const rpcMessage = {
                    ...message,
                    correlationId,
                    replyTo: 'amq.rabbitmq.reply-to'
                };

                // Send the message and wait for response
                const response = await this.mqClient?.sendRpcRequest('stage7', routingKey, rpcMessage, 30000);

                // If this is a request from a client, send the response back to the client
                if (clientId) {
                    this.sendToClient(clientId, response);
                }

                return;
            } else {
                // For asynchronous messages, just publish
                await this.mqClient?.publishMessage('stage7', routingKey, message);
                console.log(`Published async message to queue with routing key: ${routingKey}`);
                return;
            }
        } catch (error) {
            console.error('Failed to publish message to queue:', error);
        }

        // Fallback to traditional HTTP-based queue
        if (!this.messageQueue.has(recipientId)) {
            this.messageQueue.set(recipientId, []);
        }
        this.messageQueue.get(recipientId)!.push(message);
        console.log(`Added message to HTTP queue for ${recipientId}`);
    }

    private sendToClient(clientId: string, message: any) {
        const client = this.clients.get(clientId);
        if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
            console.log(`Message sent to client ${clientId}`);
        } else {
            console.error(`Client ${clientId} not found or not ready. ReadyState: ${client ? client.readyState : 'Client not found'}`);
            if (client) {
                console.log(`Attempting to reconnect client ${clientId}`);
            }
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
            res.status(401).send({ error: 'No authorization token provided' });
            return;
        }

        try {
            const missionControlUrl = this.getComponentUrl('MissionControl') || process.env.MISSIONCONTROL_URL;
            if (!missionControlUrl) {
                res.status(404).send('Failed to create mission');
                return;
            }

            console.log(`Using MissionControl URL: ${missionControlUrl}`);

            // Pass the authorization header
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': token
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
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error creating mission:', error instanceof Error ? error.message : error);
            res.status(503).json({ error: `Could not create mission, error: ${error instanceof Error ? error.message : 'Unknown' }`});
        }
    }

    private async loadMission(req: express.Request, res: express.Response) {
        const { missionId, clientId } = req.body;
        try {
            const missionControlUrl = this.getComponentUrl('MissionControl');
            if (!missionControlUrl) {
                res.status(500).send({ error: 'Failed to load mission' });
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
            console.error('Component registration failed:', error instanceof Error ? error.message : error, ' for ',id,'-',type);
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
            const recipientUrl = await this.discoverService(message.recipient || '');
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
            const recipientUrl = await this.discoverService(parsedMessage.recipient || '');
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
        // First try to discover the service using Consul
        try {
            if (this.serviceDiscovery) {
                const discoveredUrl = await this.serviceDiscovery.discoverService(type);
                if (discoveredUrl) {
                    console.log(`Service ${type} discovered via Consul: ${discoveredUrl}`);
                    return discoveredUrl;
                }
            }
        } catch (error) {
            console.error(`Error discovering service ${type} via Consul:`, error);
        }

        // Fall back to the local registry
        const services = Array.from(this.components.entries())
            .filter(([_, service]) => service.type === type)
            .map(([gid, service]) => ({ gid, ...service }));

        if (services.length > 0) {
            console.log(`Service ${type} found in local registry: ${services[0].url}`);
            return services[0].url;
        }

        // Fall back to environment variables as a last resort
        const envVarName = `${type.toUpperCase()}_URL`;
        const envUrl = process.env[envVarName];
        if (envUrl) {
            console.log(`Service ${type} found in environment variables: ${envUrl}`);
            return envUrl;
        }

        console.error(`Service ${type} not found in any registry`);
        return undefined;
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
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Failed to send message to ${url}:`, error instanceof Error ? error.message : error);
        }
    }
    private getServices(_req: express.Request, res: express.Response) {
        const services = {
            capabilitiesManagerUrl: this.getComponentUrl('CapabilitiesManager') || process.env.CAPABILITIESMANAGER_URL || 'capabilitiesmanager:5060',
            brainUrl: this.getComponentUrl('Brain') || process.env.BRAIN_URL || 'brain:5070',
            trafficManagerUrl: this.getComponentUrl('TrafficManager') || process.env.TRAFFICMANAGER_URL || 'trafficmanager:5080',
            librarianUrl: this.getComponentUrl('Librarian') || process.env.LIBRARIAN_URL || 'librarian:5040',
            missionControlUrl: this.getComponentUrl('MissionControl') || process.env.MISSIONCONTROL_URL || 'missioncontrol:5030',
            engineerUrl: this.getComponentUrl('Engineer') || process.env.ENGINEER_URL || 'engineer:5050'
        };
        console.log('Returning service URLs:', services);
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

        if (resolver && typeof resolver === 'function')  {
            resolver(response);
            this.userInputRequests.delete(requestId);
            res.status(200).send({ message: 'User input received' });
        } else {
            res.status(404).send({ error: 'User input request not found' });
        }
    }
    private async getSavedMissions(req: express.Request, res: express.Response) {
        try {
            const librarianUrl = this.getComponentUrl('Librarian') || process.env.LIBRARIAN_URL;
            if (!librarianUrl) {
                res.status(200).send([]);
                return;
            }

            // Extract user ID from the JWT token
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) {
                res.status(401).send({ error: 'No token provided' });
                return;
            }

            // Initialize token manager if not already done
            if (!this.tokenManager) {
                const serviceId = this.componentType;
                const serviceSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';
                this.tokenManager = ServiceTokenManager.getInstance(`http://${this.securityManagerUrl}`, serviceId, serviceSecret);
                console.log(`Created ServiceTokenManager for ${serviceId}`);
            }

            // Verify token using ServiceTokenManager with RS256
            const decodedToken = await this.tokenManager.verifyToken(token) as { id: string };
            if (!decodedToken) {
                res.status(401).send({ error: 'Invalid token' });
                return;
            }
            const userId = decodedToken.id;

            const response = await api.get(`http://${librarianUrl}/getSavedMissions`, {
                params: { userId }
            });
            res.status(200).send(response.data);
        } catch (error) {
            analyzeError(error as Error);
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
        console.log('Request method:', req.method);
        console.log('Request body:', req.body);

        const securityManagerPath = req.originalUrl.split('/securityManager')[1] || '/';
        const fullUrl = `http://${this.securityManagerUrl}${securityManagerPath}`;
        console.log(`Forwarding request to SecurityManager: ${fullUrl}`);

        try {
            const requestConfig = {
                method: req.method as any,
                url: fullUrl,
                data: req.body,
                headers: {
                    ...req.headers,
                    host: this.securityManagerUrl.split(':')[0],
                    'Content-Type': 'application/json'
                },
                params: req.query,
                validateStatus: function (status:any) {
                    return status < 500;
                }
            };

            console.log('Request being sent to SecurityManager:', JSON.stringify(requestConfig, null, 2));

            const response = await axios(requestConfig);

            console.log('Response from SecurityManager:', response.data);
            res.status(response.status).json(response.data);
        } catch (error) {
            console.error(`Error forwarding request to SecurityManager:`, error);
            if (axios.isAxiosError(error) && error.response) {
                res.status(error.response.status).json(error.response.data);
            } else {
                res.status(500).json({ error: 'Internal server error' });
            }
        }
    }

    /**
     * Helper method to check if a client should be allowed to connect
     * Uses BaseEntity's token verification logic
     * @param clientId Client ID
     * @param token JWT token
     * @returns Promise resolving to true if client should be allowed, false otherwise
     */
    private async validateClientConnection(clientId: string, token: string): Promise<boolean> {
        try {
            // Use the token manager from BaseEntity to verify the token
            const tokenManager = this.getTokenManager();
            const decoded = await tokenManager.verifyToken(token);

            if (!decoded) {
                console.log(`Token verification failed for client ${clientId}`);
                return false;
            }

            console.log(`Token verified successfully for client ${clientId}`);
            return true;
        } catch (error) {
            console.error(`Token verification error for client ${clientId}:`, error instanceof Error ? error.message : String(error));
            return false;
        }
    }
}

new PostOffice();