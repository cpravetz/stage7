import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import WebSocket from 'ws';
import http from 'http';
import { Component } from './types/Component';
import { Message, MessageType, BaseEntity, LLMConversationType, ToolSource, PendingTool, PluginManifest, DefinitionManifest } from '@cktmcs/shared';
import axios from 'axios';
import { analyzeError } from '@cktmcs/errorhandler';
import bodyParser from 'body-parser';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { MessageRouter } from './messageRouting';
import { ServiceDiscoveryManager } from './serviceDiscoveryManager';
import { WebSocketHandler } from './webSocketHandler';
import { HealthCheckManager } from './healthCheckManager';
import { FileUploadManager } from './fileUploadManager';
import { PluginManager } from './pluginManager';


export class PostOffice extends BaseEntity {
    private app: express.Express;
    private server: http.Server;
    private components: Map<string, Component> = new Map();
    private componentsByType: Map<string, Set<string>> = new Map();
    private wss: WebSocket.Server;
    private clients: Map<string, WebSocket> = new Map();
    private userInputRequests: Map<string, (response: any) => void> = new Map();
    private userInputRequestMetadata: Map<string, { answerType: string; question: string; choices?: string[] }> = new Map();
    private userInputResponses: Map<string, { status: string; answer?: any; timestamp: number }> = new Map();
    private messageQueue: Map<string, Message[]> = new Map();
    private messageRouter: MessageRouter;
    private clientMessageQueue: Map<string, Message[]> = new Map(); // Queue for messages to clients without active connections
    // Subscriptions map for future use
    // private subscriptions: Map<string, Set<string>> = new Map();
    private readonly messageProcessingInterval: NodeJS.Timeout; // Used to periodically process the message queue
    private clientMissions: Map<string, string> = new Map(); // Maps clientId to missionId
    private missionClients: Map<string, Set<string>> = new Map(); // Maps missionId to set of clientIds
    private serviceDiscoveryManager: ServiceDiscoveryManager;
    private webSocketHandler: WebSocketHandler;
    private healthCheckManager: HealthCheckManager;
    private fileUploadManager: FileUploadManager;
    private pluginManager: PluginManager;

    constructor() {
        // Call the BaseEntity constructor with required parameters
        const id = uuidv4();
        const componentType = 'PostOffice';
        const urlBase = process.env.POSTOFFICE_URL || 'postoffice';
        const port = process.env.PORT || '5020';
        // Skip PostOffice registration since this is the PostOffice itself
        super(id, componentType, urlBase, port, true);
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({
            server: this.server,
            verifyClient: (_info, callback) => {
                callback(true);
            }
        });

        // Initialize the ServiceDiscoveryManager
        this.serviceDiscoveryManager = new ServiceDiscoveryManager(
            this.components,
            this.componentsByType,
            this.serviceDiscovery
        );

        // Initialize the WebSocketHandler
        this.webSocketHandler = new WebSocketHandler(
            this.clients,
            this.clientMessageQueue,
            this.clientMissions,
            this.missionClients,
            this.authenticatedApi,
            (type) => this.serviceDiscoveryManager.getComponentUrl(type),
            this.handleWebSocketMessage.bind(this)
        );

        // Set up WebSocket server
        this.webSocketHandler.setupWebSocket(this.wss);

        // Set up WebSocket connection handler
        this.setupWebSocket();

        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 10000, // Increased for debugging
        });
        this.app.use(limiter);

        const corsOptions = {
            origin: ['http://localhost', 'http://localhost:80', 'http://localhost:3000', 'http://frontend', 'http://frontend:80'],
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Allow-Origin', 'Access-Control-Allow-Headers'],
            credentials: true,
            preflightContinue: false,
            optionsSuccessStatus: 204
        };
        this.app.use(cors(corsOptions));

        // Handle preflight requests
        this.app.options('*', cors(corsOptions));

        this.app.use(bodyParser.json({ limit: '500mb' }));
        this.app.use(bodyParser.urlencoded({ limit: '500mb', extended: true }));

        this.app.use((_req: Request, res: Response, next: NextFunction) => {
            res.setHeader('Content-Type', 'application/json');
            next();
        });

        // Initialize the HealthCheckManager and set up health check endpoints
        // This must be done BEFORE applying authentication middleware
        this.healthCheckManager = new HealthCheckManager(
            this.app,
            this.mqClient,
            this.serviceDiscovery,
            this.components,
            this.componentsByType,
            this.componentType
        );
        this.healthCheckManager.setupHealthCheck();

        // Initialize the FileUploadManager and PluginManager
        this.fileUploadManager = new FileUploadManager(
            this.authenticatedApi,
            (type) => this.serviceDiscoveryManager.getComponentUrl(type)
        );
        this.pluginManager = new PluginManager(
            this.authenticatedApi,
            (type) => this.serviceDiscoveryManager.getComponentUrl(type)
        );

        // Apply authentication middleware to all routes EXCEPT health check endpoints, registerComponent, and token refresh
        // Import the isHealthCheckEndpoint function from shared middleware
        const { isHealthCheckEndpoint } = require('@cktmcs/shared/dist/middleware/authMiddleware.js');
        this.app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
            // Skip authentication for health check endpoints, registerComponent, and token refresh
            if (isHealthCheckEndpoint(req.path) ||
                req.path === '/registerComponent' ||
                req.path === '/securityManager/refresh-token' ||
                req.path === '/securityManager/auth/refresh-token') {
                return next();
            }

            return this.verifyToken(req, res, next);
        });

        this.app.get('/', (_req: Request, res: Response) => {
            res.send('PostOffice service is running');
        });

        this.app.post('/registerComponent', (req: Request, res: Response) => {
            console.log('Received registration request:', req.body);
            this.registerComponent(req, res);
        });

        this.app.post('/message', (req: Request, res: Response) => this.handleMessage(req, res));
        this.app.post('/sendMessage', (req: Request, res: Response) => this.handleIncomingMessage(req, res));
        this.app.use('/securityManager/*', async (req: Request, res: Response, next: NextFunction) => this.routeSecurityRequest(req, res, next));
        this.app.get('/requestComponent', (req: Request, res: Response) => this.requestComponent(req, res));
        this.app.get('/getServices', (req: Request, res: Response) => this.getServices(req, res));
        this.app.post('/submitUserInput', this.fileUploadManager.getUploadMiddleware(), (req: Request, res: Response) => { this.submitUserInput(req, res);});
        this.app.post('/sendUserInputRequest', (req: Request, res: Response) => this.sendUserInputRequest(req, res));
        this.app.get('/getUserInputResponse/:requestId', (req: Request, res: Response) => this.getUserInputResponse(req, res));
        this.app.post('/createMission', (req: Request, res: Response) => this.createMission(req, res));
        this.app.post('/loadMission', (req: Request, res: Response) => this.loadMission(req, res));
        this.app.get('/librarian/retrieve/:id', (req: Request, res: Response) => this.retrieveWorkProduct(req, res));
        this.app.get('/getSavedMissions', (req: Request, res: Response) => this.getSavedMissions(req, res));
        this.app.get('/step/:stepId', (req: Request, res: Response) => { this.getStepDetails(req, res);});
        this.app.get('/brain/performance', (req: Request, res: Response) => { this.getModelPerformance(req, res);});
        this.app.get('/brain/performance/rankings', (req: Request, res: Response) => { this.getModelRankings(req, res);});
        this.app.post('/brain/evaluations', (req: Request, res: Response) => { this.submitModelEvaluation(req, res);});

        // External Tool Management Endpoints
        this.app.get('/tools/sources', (req: Request, res: Response) => this.getToolSources(req, res));
        this.app.post('/tools/sources', (req: Request, res: Response) => this.addToolSource(req, res));
        this.app.delete('/tools/sources/:id', (req: Request, res: Response) => this.deleteToolSource(req, res));
        this.app.get('/tools/pending', (req: Request, res: Response) => this.getPendingTools(req, res));
        this.app.post('/tools/pending/:id/approve', (req: Request, res: Response) => this.approvePendingTool(req, res));
        this.app.post('/tools/pending/:id/reject', (req: Request, res: Response) => this.rejectPendingTool(req, res));

        this.app.delete('/missions/:missionId/files/:fileId', (req: Request, res: Response) => this.deleteMissionFile(req, res));

        this.app.get('/missions/:missionId/files/:fileId/download', (req: Request, res: Response) => this.downloadMissionFile(req, res));

        // Generic API proxy for frontend requests
        this.app.all('/api/*', async (req: Request, res: Response) => {
            const originalPath = req.originalUrl.replace('/api', ''); // Remove /api prefix
            const serviceName = originalPath.split('/')[1]; // e.g., 'librarian', 'capabilitiesmanager'

            if (!serviceName) {
                return res.status(400).send({ error: 'Service name missing in API request' });
            }

            const targetServiceUrl = this.getComponentUrl(serviceName);
            if (!targetServiceUrl) {
                return res.status(503).send({ error: `Service ${serviceName} not available` });
            }

            const targetPath = originalPath.replace(`/${serviceName}`, ''); // Remove service name prefix
            const fullUrl = `http://${targetServiceUrl}${targetPath}`;

            try {
                const response = await this.authenticatedApi({
                    method: req.method as any,
                    url: fullUrl,
                    data: req.body,
                    headers: {
                        ...req.headers as Record<string, string>,
                        host: new URL(`http://${targetServiceUrl}`).host,
                        'Content-Type': req.headers['content-type'] || 'application/json',
                        'Authorization': req.headers['authorization'] || '',
                    },
                    params: req.query,
                    validateStatus: function (status: any) {
                        return status < 500; // Resolve only if status is less than 500
                    }
                });
                res.status(response.status).send(response.data);
            } catch (error: any) {
                console.error(`Error proxying request to ${serviceName}:`, error.message);
                res.status(error.response?.status || 500).send(error.response?.data || 'Proxy error');
            }
        });

        // Setup plugin management routes
        this.pluginManager.setupRoutes(this.app);

        // Setup file upload routes
        this.fileUploadManager.setupRoutes(this.app);

        const serverPort = parseInt(this.port, 10);
        this.server.listen(serverPort, '0.0.0.0', () => {
            console.log(`PostOffice listening on all interfaces at port ${serverPort}`);
        });
        // Initialize the MessageRouter with serviceDiscoveryManager and webSocketHandler
        this.messageRouter = new MessageRouter(
            this.components,
            this.messageQueue,
            this.missionClients,
            this.mqClient,
            this.authenticatedApi,
            this.id,
            this.webSocketHandler
        );

        // Set up the message processing interval
        this.messageProcessingInterval = setInterval(() => this.messageRouter.processMessageQueue(), 100);
    }


    private async retrieveWorkProduct(req: express.Request, res: express.Response) {
        try {
            const librarianUrl = this.getComponentUrl('Librarian');
            if (!librarianUrl) {
                res.status(404).send({ error: 'Librarian not registered' });
            }
            const response = await this.authenticatedApi.get(`http://${librarianUrl}/loadWorkProduct/${req.params.id}`);
            res.status(200).send(response.data);
        }
        catch (error) {
            analyzeError(error as Error);
            console.error('Error retrieving work product:', error instanceof Error ? error.message : error, 'id:',req.params.id);
            res.status(500).send({ error: `Failed to retrieve work product id:${req.params.id}`});
        }
    }

    protected async handleQueueMessage(message: Message) {
        await this.messageRouter.handleQueueMessage(message);
    }

    private setupWebSocket() {
        this.wss.on('connection', async (ws: WebSocket, req: http.IncomingMessage) => {
            const url = new URL(req.url!, `http://${req.headers.host}`);
            let clientId = url.searchParams.get('clientId');
            const token = url.searchParams.get('token');

            // Remove 'browser-' prefix if present for consistency
            if (clientId && clientId.startsWith('browser-')) {
                clientId = clientId.substring(8);
            }

            console.log(`WebSocket connection attempt - ClientID: ${clientId}, Token: ${token}`);

            if (!clientId) {
                console.log('Client ID missing');
                ws.close(1008, 'Client ID missing');
                return;
            }

            const isValid = true; //await this.validateClientConnection(clientId, token);
            if (!isValid) {
                console.log(`Invalid token for client ${clientId}`);
                ws.close(1008, 'Invalid token');
                return;
            }
            this.clients.set(clientId, ws);
            console.log(`Client ${clientId} connected successfully`);

            // Check if this client has an associated mission
            const missionId = this.clientMissions.get(clientId);
            if (missionId) {
                console.log(`Client ${clientId} is associated with mission ${missionId}`);

                // Make sure the mission is in the missionClients map
                if (!this.missionClients.has(missionId)) {
                    this.missionClients.set(missionId, new Set());
                }

                // Add the client to the mission's client set
                this.missionClients.get(missionId)!.add(clientId);
                console.log(`Added client ${clientId} to mission ${missionId} clients`);
            } else {
                console.log(`Client ${clientId} is not associated with any mission yet`);
            }

            // Send any queued messages to the client
            if (this.clientMessageQueue.has(clientId)) {
                const queuedMessages = this.clientMessageQueue.get(clientId)!;
                console.log(`Sending ${queuedMessages.length} queued messages to client ${clientId}`);

                while (queuedMessages.length > 0) {
                    const message = queuedMessages.shift()!;
                    try {
                        ws.send(JSON.stringify(message));
                        console.log(`Sent queued message of type ${message.type} to client ${clientId}`);
                    } catch (error) {
                        console.error(`Error sending queued message to client ${clientId}:`, error instanceof Error ? error.message : error);
                        // Put the message back in the queue
                        this.clientMessageQueue.get(clientId)!.unshift(message);
                        break;
                    }
                }
                console.log(`All queued messages sent to client ${clientId}`);
            }

            ws.on('message', (message: string) => {
                try {
                    const parsedMessage = JSON.parse(message.toString());
                    console.log(`Received WebSocket message from client ${clientId}:`, parsedMessage);

                    if (parsedMessage.type === MessageType.CLIENT_CONNECT) {
                        console.log(`Client ${parsedMessage.clientId} confirmed connection`);

                        // Associate this client with any missions it might have
                        if (this.clientMissions.has(clientId)) {
                            const missionId = this.clientMissions.get(clientId)!;
                            console.log(`Associating client ${clientId} with mission ${missionId}`);

                            // Make sure the mission is in the missionClients map
                            if (!this.missionClients.has(missionId)) {
                                this.missionClients.set(missionId, new Set());
                            }

                            // Add the client to the mission's client set
                            this.missionClients.get(missionId)!.add(clientId);
                        }
                    } else {
                        this.handleWebSocketMessage(parsedMessage, token || '');
                    }
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error instanceof Error ? error.message : error);
                    console.log('Raw message:', message);
                }
            });

            ws.on('close', async () => {
                console.log(`Client ${clientId} disconnected`);
                this.clients.delete(clientId);

                // Check if this client had an active mission
                const missionId = this.clientMissions.get(clientId);
                if (missionId) {
                    console.log(`Client ${clientId} disconnected with active mission ${missionId}. Pausing mission...`);

                    try {
                        // Send pause message to MissionControl
                        const missionControlUrl = this.getComponentUrl('MissionControl');
                        if (missionControlUrl) {
                            await this.authenticatedApi.post(`http://${missionControlUrl}/message`, {
                                type: MessageType.PAUSE,
                                sender: 'PostOffice',
                                recipient: 'MissionControl',
                                content: {
                                    type: 'pause',
                                    action: 'pause',
                                    missionId: missionId,
                                    reason: 'Client disconnected'
                                },
                                timestamp: new Date().toISOString()
                            });
                            console.log(`Successfully paused mission ${missionId} due to client ${clientId} disconnection`);
                        } else {
                            console.error(`Could not pause mission ${missionId}: MissionControl not found`);
                        }
                    } catch (error) {
                        analyzeError(error as Error);
                        console.error(`Failed to pause mission ${missionId}:`, error instanceof Error ? error.message : error);
                    }
                }
            });

            ws.send(JSON.stringify({ type: 'CONNECTION_CONFIRMED', clientId }));
        });
    }

    protected handleMessage = async (req: express.Request, res: express.Response) => {
        const message: Message = req.body;
        await this.messageRouter.routeMessage(message);
        res.status(200).send({ status: 'Message queued for processing' });
    }

    // These methods are now handled by the MessageRouter and WebSocketHandler

    private async createMission(req: express.Request, res: express.Response) {
        const { goal, clientId } = req.body;
        const token = req.headers.authorization;

        console.log(`PostOffice has request to createMission for goal`, goal);

        // Add a mock user object to the request
        (req as any).user = {
            componentType: 'MissionControl',
            roles: ['mission:manage', 'agent:control'],
            issuedAt: Date.now()
        };
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

            // Extract userId from token or use default
            // Since we've disabled token verification, we'll use a default userId
            const userId = 'system';

            const response = await this.authenticatedApi.post(`http://${missionControlUrl}/message`, {
                type: MessageType.CREATE_MISSION,
                sender: 'PostOffice',
                recipient: 'MissionControl',
                clientId,
                // Add userId to the message payload
                userId: userId,
                content: {
                    goal
                },
                timestamp: new Date().toISOString()
            }, { headers });

            // Store the mission ID for this client
            if (response.data && response.data.result && response.data.result.missionId) {
                const missionId = response.data.result.missionId;
                this.clientMissions.set(clientId, missionId);
                console.log(`Associated client ${clientId} with mission ${missionId}`);

                // Also store the client ID for this mission
                if (!this.missionClients.has(missionId)) {
                    this.missionClients.set(missionId, new Set());
                }
                this.missionClients.get(missionId)!.add(clientId);
                console.log(`Added client ${clientId} to mission ${missionId} clients`);
            }

            // Store the mission ID for this client if it's in the response
            if (response.data && response.data.missionId) {
                const missionId = response.data.missionId;
                this.clientMissions.set(clientId, missionId);
                console.log(`Associated client ${clientId} with mission ${missionId}`);

                // Also store the client ID for this mission
                if (!this.missionClients.has(missionId)) {
                    this.missionClients.set(missionId, new Set());
                }
                this.missionClients.get(missionId)!.add(clientId);
                console.log(`Added client ${clientId} to mission ${missionId} clients list`);
            }

            res.status(200).send(response.data);
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error creating mission:', error instanceof Error ? error.message : error);
            res.status(504).json({ error: `Could not create mission, error: ${error instanceof Error ? error.message : 'Unknown' }`});
        }
    }

    private async loadMission(req: express.Request, res: express.Response) {
        const { missionId, clientId } = req.body;
        // Authorization token is available in req.headers.authorization if needed

        try {
            const missionControlUrl = this.getComponentUrl('MissionControl');
            if (!missionControlUrl) {
                res.status(500).send({ error: 'Failed to load mission' });
                return;
            }

            // Since we've disabled token verification, we'll use a default userId
            const userId = 'system';

            const response = await this.authenticatedApi.post(`http://${missionControlUrl}/loadMission`, {
                missionId,
                clientId,
                // Add userId to the payload
                userId: userId
            });

            // Store the mission ID for this client
            this.clientMissions.set(clientId, missionId);
            console.log(`Associated client ${clientId} with loaded mission ${missionId}`);

            // Also store the client ID for this mission
            if (!this.missionClients.has(missionId)) {
                this.missionClients.set(missionId, new Set());
            }
            this.missionClients.get(missionId)!.add(clientId);
            console.log(`Added client ${clientId} to mission ${missionId} clients list`);

            res.status(200).send(response.data);
        } catch (error) { analyzeError(error as Error);
            console.error('Error loading mission:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to load mission' });
        }
    }

    private async registerComponent(req: express.Request, res: express.Response) {
        try {
            const { id, type, url } = req.body;

            if (!id || !type || !url) {
                res.status(400).send({ error: 'Missing required fields: id, type, url' });
                return;
            }

            await this.serviceDiscoveryManager.registerComponent(id, type, url);
            res.status(200).send({ status: 'Component registered successfully' });
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error registering component:', error instanceof Error ? error.message : error);
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

            if (parsedMessage.type === MessageType.LIST_MISSIONS) {
                const missionControlUrl = await this.serviceDiscoveryManager.discoverService('MissionControl');
                if (missionControlUrl) {
                    await this.sendToComponent(missionControlUrl, parsedMessage, token);
                } else {
                    console.error(`(ws)Recipient not found for ${JSON.stringify(parsedMessage)}`);
                }
                return;
            }

                    console.log('Looking for client:', parsedMessage.recipient);
                    if (!parsedMessage.recipient) {
                        console.log('Message received without recipient, not routing.');
                        return;
                    }
                    const recipientUrl = await this.serviceDiscoveryManager.discoverService(parsedMessage.recipient || '');            if (!recipientUrl) {
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
        return this.serviceDiscoveryManager.discoverService(type);
    }

    private async sendToComponent(url: string, message: Message, token: string): Promise<void> {
        try {
            // Ensure the URL has a protocol
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = `http://${url}`;
            }
            message.type = message.type || message.content.type;
            console.log(`Sending message to: ${url}: ${message}`);
            await this.authenticatedApi.post(url, message, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` // Forward the token
                }
            });
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Failed to send message to ${url}:`, error instanceof Error ? error.message : error);
        }
    }
    private getServices(_req: express.Request, res: express.Response) {
        const services = this.serviceDiscoveryManager.getServices();
        res.status(200).send(services);
    }

    private getComponentUrl(type: string): string | undefined {
        return this.serviceDiscoveryManager.getComponentUrl(type);
    }

    private async submitUserInput(req: express.Request, res: express.Response) {
        try {
            const { requestId, response, cancel } = req.body;
            const files = req.files as Express.Multer.File[];

            const resolver = this.userInputRequests.get(requestId);
            const metadata = this.userInputRequestMetadata.get(requestId);

            if (!resolver || typeof resolver !== 'function') {
                return res.status(404).send({ error: 'User input request not found' });
            }

            if (!metadata) {
                return res.status(404).send({ error: 'User input request metadata not found' });
            }

            // Handle cancellation
            if (cancel === true) {
                // Clean up the request without resolving
                this.userInputRequests.delete(requestId);
                this.userInputRequestMetadata.delete(requestId);

                // Store cancelled status for polling
                this.userInputResponses.set(requestId, {
                    status: 'cancelled',
                    timestamp: Date.now()
                });

                // Notify agents of cancellation
                await this.notifyAgentOfUserResponse(requestId, null); // Send null to indicate cancellation

                return res.status(200).send({ message: 'User input cancelled' });
            }

            let finalResponse = response;

            // Handle file uploads for 'file' answerType
            if (metadata.answerType === 'file') {
                if (!files || files.length === 0) {
                    return res.status(400).send({ error: 'No files provided for file input request' });
                }

                try {
                    // Upload the first file and get its ID
                    const file = files[0];
                    const uploadedFile = await this.fileUploadManager.fileUploadServiceInstance.uploadFile(
                        file.buffer,
                        file.originalname,
                        file.mimetype,
                        'user', // TODO: Get actual user ID from authentication
                        { description: `File uploaded in response to: ${metadata.question}` }
                    );

                    // Store the file metadata in Librarian
                    const librarianUrl = this.getComponentUrl('Librarian');
                    if (librarianUrl) {
                        const missionFile = this.fileUploadManager.fileUploadServiceInstance.convertToMissionFile(uploadedFile);
                        await this.authenticatedApi.post(`http://${librarianUrl}/storeData`, {
                            id: uploadedFile.id,
                            data: missionFile,
                            collection: 'files',
                            storageType: 'mongo'
                        });
                    }

                    // Return the file ID as the response
                    finalResponse = uploadedFile.id;
                } catch (uploadError) {
                    console.error('Error uploading file for user input:', uploadError);
                    return res.status(500).send({ error: 'Failed to upload file' });
                }
            }

            // Store the response for polling
            this.userInputResponses.set(requestId, {
                status: 'completed',
                answer: finalResponse,
                timestamp: Date.now()
            });

            // Resolve the request with the response (either text response or file ID)
            resolver(finalResponse);
            this.userInputRequests.delete(requestId);
            this.userInputRequestMetadata.delete(requestId);

            res.status(200).send({ message: 'User input received' });
        } catch (error) {
            console.error('Error in submitUserInput:', error);
            res.status(500).send({ error: 'Internal server error' });
        }
    }
    private async getSavedMissions(req: express.Request, res: express.Response) {
        try {
            const librarianUrl = this.getComponentUrl('Librarian') || process.env.LIBRARIAN_URL;
            if (!librarianUrl) {
                res.status(200).send([]);
                return;
            }

            // Extract userId from the authentication token
            const token = req.headers.authorization?.split(' ')[1];
            let userId = 'system'; // Fallback default

            if (token) {
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET || '');
                    userId = (decoded as any).userId || 'system';
                } catch (error) {
                    console.error('Error verifying token:', error);
                }
            }

            console.log(`Using userId: ${userId} for getSavedMissions`);

            const response = await this.authenticatedApi.get(`http://${librarianUrl}/getSavedMissions`, {
                params: { userId }
            });
            res.status(200).send(response.data);
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error getting saved missions:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to get saved missions' });
        }
    }

    private async getModelPerformance(_req: express.Request, res: express.Response) {
        try {
            console.log('Received request for model performance data');
            const librarianUrl = this.getComponentUrl('Librarian');

            if (!librarianUrl) {
                console.error('Librarian service not registered');
                return res.status(404).json({ error: 'Librarian service not available' });
            }

            console.log(`Retrieving model performance data from Librarian at ${librarianUrl}`);

            try {
                const response = await this.authenticatedApi.post(`http://${librarianUrl}/queryData`, {
                    collection: 'mcsdata',
                    limit: 1,
                    query: { _id: 'model-performance-data' }
                });

                console.log('Full Librarian response:', JSON.stringify(response.data));
                console.log('Raw Librarian response for performance:', JSON.stringify(response.data.data));

                if (!response.data || !response.data.data || response.data.data.length === 0) {
                    console.log('No model performance data found');
                    return res.status(200).json({
                        success: true,
                        performanceData: []
                    });
                }

                // Extract the document from the response
                const performanceDoc = response.data.data[0];
                console.log('Performance document:', JSON.stringify(performanceDoc));
                console.log('Performance data type:', typeof performanceDoc.performanceData);
                console.log('Is performance data an array?', Array.isArray(performanceDoc.performanceData));

                if (performanceDoc.performanceData) {
                    console.log('Performance data length:', performanceDoc.performanceData.length);
                    console.log('First item in performance data:', JSON.stringify(performanceDoc.performanceData[0]));
                }

                // Check if performanceData exists and is an array
                if (!performanceDoc.performanceData || !Array.isArray(performanceDoc.performanceData)) {
                    console.log('Performance data is missing or not an array:', performanceDoc.performanceData);
                    // Return an empty array if performanceData is missing or not an array
                    return res.status(200).json({
                        success: true,
                        performanceData: []
                    });
                }

                // Set the correct content type to ensure the response is treated as JSON
                res.setHeader('Content-Type', 'application/json');

                return res.status(200).json({
                    success: true,
                    performanceData: performanceDoc.performanceData
                });
            } catch (error) {
                console.error('Error querying model performance data:', error instanceof Error ? error.message : error);
                return res.status(500).json({ error: 'Failed to query model performance data' });
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error getting model performance data:', error instanceof Error ? error.message : error);
            return res.status(500).json({ error: 'Failed to get model performance data' });
        }
    }

    private async getModelRankings(req: express.Request, res: express.Response) {
        try {
            console.log('Received request for model rankings');
            const librarianUrl = this.getComponentUrl('Librarian');

            if (!librarianUrl) {
                console.error('Librarian service not registered');
                return res.status(404).json({ error: 'Librarian service not available' });
            }

            // Get query parameters
            const conversationType = req.query.conversationType as LLMConversationType || LLMConversationType.TextToText;
            const metric = req.query.metric as string || 'overall';

            try {
                const response = await this.authenticatedApi.post(`http://${librarianUrl}/queryData`, {
                    collection: 'mcsdata',
                    limit: 1,
                    query: { _id: 'model-performance-data' }
                });

                if (!response.data || !response.data.data || response.data.data.length === 0) {
                    console.log('No model rankings data found, returning empty rankings');
                    return res.status(200).json({
                        success: true,
                        rankings: []
                    });
                }

                const data = response.data.data[0];

                // Check if rankings exists
                if (!data.rankings) {
                    return res.status(200).json({
                        success: true,
                        rankings: []
                    });
                }

                const rankings = data.rankings;

                // Check if the requested conversation type and metric exist
                if (!rankings[conversationType] || !rankings[conversationType][metric]) {
                    console.log(`No rankings found for conversationType=${conversationType}, metric=${metric}`);
                    return res.status(200).json({
                        success: true,
                        rankings: []
                    });
                }

                // Check if the rankings array is valid
                const rankingsArray = rankings[conversationType][metric];
                if (!Array.isArray(rankingsArray)) {
                    console.log(`Rankings for conversationType=${conversationType}, metric=${metric} is not an array:`, rankingsArray);
                    return res.status(200).json({
                        success: true,
                        rankings: []
                    });
                }

                console.log(`Retrieved ${rankingsArray.length} model rankings from Librarian`);

                res.setHeader('Content-Type', 'application/json');

                return res.status(200).json({
                    success: true,
                    rankings: rankingsArray
                });
            } catch (error) {
                console.error('Error querying model rankings data:', error instanceof Error ? error.message : error);
                return res.status(500).json({ error: 'Failed to query model rankings data' });
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error getting model rankings:', error instanceof Error ? error.message : error);
            return res.status(500).json({ error: 'Failed to get model rankings' });
        }
    }

    private async routeSecurityRequest(req: express.Request, res: express.Response, next: express.NextFunction) {
        if (!this.securityManagerUrl) {
            res.status(505).json({ error: 'SecurityManager not registered yet' });
            return next();
        }

        console.log('Original URL:', req.originalUrl);
        console.log('Request method:', req.method);
        console.log('Request body:', req.body);

        const securityManagerPath = req.originalUrl.split('/securityManager')[1] || '/';
        const fullUrl = `${this.securityManagerUrl}${securityManagerPath}`;
        console.log(`Forwarding request to SecurityManager: ${fullUrl}`);

        try {
            const securityManagerUrlObject = new URL(this.securityManagerUrl);
            const requestConfig = {
                method: req.method as any,
                url: fullUrl,
                data: req.body,
                headers: {
                    ...req.headers,
                    host: securityManagerUrlObject.host,
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

    // Note: Token validation is currently disabled, all connections are allowed
    // This is referenced in the setupWebSocket method with: const isValid = true;

    async submitModelEvaluation(req: express.Request, res: express.Response) {
        try {
            const { modelName, conversationType, requestId, prompt, response, scores } = req.body;
            const brainUrl = this.getComponentUrl('Brain');

            if (!brainUrl) {
                console.error('Brain service not registered');
                return res.status(404).json({ error: 'Brain service not available' });
            }
            console.log(`Submitting model evaluation to Brain at ${brainUrl}`);
            await this.authenticatedApi.post(`http://${brainUrl}/evaluations`, {
                modelName,
                conversationType,
                requestId,
                prompt,
                response,
                scores
            });

            return res.status(200).json({ success: true });
        } catch (error) {
            console.error('Error submitting model evaluation:', error instanceof Error ? error.message : error);
            return res.status(500).json({ error: 'Failed to submit model evaluation' });
        }
    }

    async getStepDetails(req: express.Request, res: express.Response) {
        // Accept stepId from either query or params for flexibility
        const stepId = req.query.stepId || req.params.stepId;
        if (!stepId) {
            return res.status(400).json({ error: 'stepId is required' });
        }
        try {
            // Discover AgentSet service URL
            const agentSetUrl = this.getComponentUrl('AgentSet') || process.env.AGENTSET_URL;
            if (!agentSetUrl) {
                return res.status(503).json({ error: 'AgentSet service not available' });
            }
            // Forward the request to AgentSet
            const response = await this.authenticatedApi.get(`http://${agentSetUrl}/agent/step/${stepId}`);
            return res.status(200).json(response.data);
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error retrieving step details from AgentSet:', error instanceof Error ? error.message : error);
            return res.status(500).json({ error: 'Failed to retrieve step details' });
        }
    }

    private async deleteMissionFile(req: express.Request, res: express.Response) {
        try {
            const { missionId, fileId } = req.params;
            const missionControlUrl = this.getComponentUrl('MissionControl');
            if (!missionControlUrl) {
                return res.status(503).send({ error: 'MissionControl service not available' });
            }
    
            // Forward the DELETE request to MissionControl
            const response = await this.authenticatedApi.delete(`http://${missionControlUrl}/missions/${missionId}/files/${fileId}`);
            
            res.status(response.status).send(response.data);
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error deleting mission file:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to delete mission file' });
        }
    }

    private async downloadMissionFile(req: express.Request, res: express.Response) {
        try {
            const { fileId } = req.params;
            const librarianUrl = this.getComponentUrl('Librarian');
            if (!librarianUrl) {
                return res.status(503).send({ error: 'Librarian service not available' });
            }
    
            const fileInfoResponse = await this.authenticatedApi.get(`http://${librarianUrl}/loadData/step-output-${fileId}`, {
                params: { collection: 'step-outputs', storageType: 'mongo' }
            });
    
            const fileData = fileInfoResponse.data.data;
            if (!fileData) {
                return res.status(404).send({ error: 'File not found' });
            }
    
            const fileName = fileData.originalName || 'download';
            const mimeType = fileData.mimeType || 'application/octet-stream';
            const content = fileData.fileContent;
    
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.setHeader('Content-Type', mimeType);
            res.send(Buffer.from(content));
    
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error downloading mission file:', error instanceof Error ? error.message : error);
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                return res.status(404).send({ error: 'File not found in storage.' });
            }
            res.status(500).send({ error: 'Failed to download mission file' });
        }
    }

    private async getToolSources(req: express.Request, res: express.Response) {
        try {
            const librarianUrl = this.getComponentUrl('Librarian');
            if (!librarianUrl) {
                return res.status(503).send({ error: 'Librarian service not available' });
            }
            const response = await this.authenticatedApi.post(`http://${librarianUrl}/queryData`, {
                collection: 'toolSources',
                query: {}
            });
            res.status(200).send(response.data.data || []);
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error getting tool sources:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to get tool sources' });
        }
    }

    private async addToolSource(req: express.Request, res: express.Response) {
        try {
            const newToolSource: ToolSource = { ...req.body, id: uuidv4() };
            const librarianUrl = this.getComponentUrl('Librarian');
            if (!librarianUrl) {
                return res.status(503).send({ error: 'Librarian service not available' });
            }
            await this.authenticatedApi.post(`http://${librarianUrl}/storeData`, {
                collection: 'toolSources',
                data: newToolSource,
                id: newToolSource.id
            });
            res.status(201).send(newToolSource);
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error adding tool source:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to add tool source' });
        }
    }

    private async deleteToolSource(req: express.Request, res: express.Response) {
        try {
            const { id } = req.params;
            const librarianUrl = this.getComponentUrl('Librarian');
            if (!librarianUrl) {
                return res.status(503).send({ error: 'Librarian service not available' });
            }
            await this.authenticatedApi.delete(`http://${librarianUrl}/deleteData/${id}`, {
                params: { collection: 'toolSources' }
            });
            res.status(204).send();
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error deleting tool source:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to delete tool source' });
        }
    }

    private async getPendingTools(req: express.Request, res: express.Response) {
        try {
            const librarianUrl = this.getComponentUrl('Librarian');
            if (!librarianUrl) {
                return res.status(503).send({ error: 'Librarian service not available' });
            }
            const response = await this.authenticatedApi.post(`http://${librarianUrl}/queryData`, {
                collection: 'pendingTools',
                query: { status: 'pending' }
            });
            res.status(200).send(response.data.data || []);
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error getting pending tools:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to get pending tools' });
        }
    }

    private async approvePendingTool(req: express.Request, res: express.Response) {
        try {
            const { id } = req.params;
            const librarianUrl = this.getComponentUrl('Librarian');
            const capabilitiesManagerUrl = this.getComponentUrl('CapabilitiesManager');

            if (!librarianUrl || !capabilitiesManagerUrl) {
                return res.status(503).send({ error: 'Librarian or CapabilitiesManager service not available' });
            }

            // 1. Fetch the pending tool
            const pendingToolResponse = await this.authenticatedApi.get(`http://${librarianUrl}/loadData/${id}`, {
                params: { collection: 'pendingTools' }
            });
            const pendingTool: PendingTool = pendingToolResponse.data.data;

            if (!pendingTool) {
                return res.status(404).send({ error: 'Pending tool not found' });
            }

            // 2. Update the pending tool status to 'approved'
            pendingTool.status = 'approved';
            await this.authenticatedApi.post(`http://${librarianUrl}/storeData`, {
                collection: 'pendingTools',
                data: pendingTool,
                id: pendingTool.id
            });

            res.status(200).send({ message: 'Pending tool approved' });
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error approving pending tool:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to approve pending tool' });
        }
    }

    private async rejectPendingTool(req: express.Request, res: express.Response) {
        try {
            const { id } = req.params;
            const librarianUrl = this.getComponentUrl('Librarian');
            if (!librarianUrl) {
                return res.status(503).send({ error: 'Librarian service not available' });
            }

            // 1. Fetch the pending tool
            const pendingToolResponse = await this.authenticatedApi.get(`http://${librarianUrl}/loadData/${id}`, {
                params: { collection: 'pendingTools' }
            });
            const pendingTool: PendingTool = pendingToolResponse.data.data;

            if (!pendingTool) {
                return res.status(404).send({ error: 'Pending tool not found' });
            }

            // 2. Update the pending tool status to 'rejected'
            pendingTool.status = 'rejected';
            await this.authenticatedApi.post(`http://${librarianUrl}/storeData`, {
                collection: 'pendingTools',
                data: pendingTool,
                id: pendingTool.id
            });

            res.status(200).send({ message: 'Pending tool rejected' });
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error rejecting pending tool:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to reject pending tool' });
        }
    }

    // Add this method to PostOffice
    private async sendUserInputRequest(req: express.Request, res: express.Response) {
        try {
            const { question, answerType, choices, clientId, missionId } = req.body;
            const request_id = require('uuid').v4();

            // Store the request metadata
            this.userInputRequestMetadata.set(request_id, {
                answerType: answerType || 'text',
                question,
                choices
            });

            // Initialize response status as pending
            this.userInputResponses.set(request_id, {
                status: 'pending',
                timestamp: Date.now()
            });

            // Store the request for later resolution
            this.userInputRequests.set(request_id, async (response: any) => {
                // This callback will be called when the user responds
                // Notify the agent system about the response
                await this.notifyAgentOfUserResponse(request_id, response);
            });

            if (clientId) {
                this.webSocketHandler.sendToClient(clientId, {
                    type: 'USER_INPUT_REQUEST',
                    request_id,
                    question,
                    answerType: answerType || 'text',
                    choices: choices || null,
                    missionId: missionId // Include missionId if available
                });
            } else if (missionId) {
                this.webSocketHandler.broadcastToMissionClients(missionId, {
                    type: 'USER_INPUT_REQUEST',
                    request_id,
                    question,
                    answerType: answerType || 'text',
                    choices: choices || null,
                    missionId: missionId // Include missionId
                });
            } else {
                // Fallback to broadcasting to all connected clients if neither clientId nor missionId is provided
                this.webSocketHandler.broadcastToClients({
                    type: 'USER_INPUT_REQUEST',
                    request_id,
                    question,
                    answerType: answerType || 'text',
                    choices: choices || null
                });
            }

            res.status(200).json({ request_id });
        } catch (error) {
            res.status(500).json({ error: 'Failed to send user input request' });
        }
    }

    private async getUserInputResponse(req: express.Request, res: express.Response) {
        try {
            const { requestId } = req.params;

            if (!requestId) {
                return res.status(400).json({ error: 'Request ID is required' });
            }

            const response = this.userInputResponses.get(requestId);

            if (!response) {
                return res.status(404).json({ error: 'Request not found' });
            }

            // Clean up old completed responses (older than 1 hour)
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            if (response.status === 'completed' && response.timestamp < oneHourAgo) {
                this.userInputResponses.delete(requestId);
                return res.status(404).json({ error: 'Request expired' });
            }

            res.status(200).json(response);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get user input response' });
        }
    }

    private async notifyAgentOfUserResponse(requestId: string, response: any): Promise<void> {
        try {
            const agentSetComponents = this.componentsByType.get('AgentSet') || new Set<string>();
            console.log(`Found ${agentSetComponents.size} AgentSet components to notify.`);

            for (const agentSetId of agentSetComponents) {
                const component = this.components.get(agentSetId);
                if (component) {
                    try {
                        const messageContent = {
                            requestId: requestId,
                            answer: response
                        };

                        const message: Message = {
                            type: MessageType.USER_INPUT_RESPONSE,
                            content: messageContent,
                            sender: this.id,
                            recipient: agentSetId,
                            timestamp: new Date().toISOString()
                        };

                        await this.messageRouter.routeMessage(message);
                        console.log(`Notified AgentSet ${agentSetId} of user response for request ${requestId}`);
                    } catch (error) {
                        console.error(`Failed to notify AgentSet ${agentSetId} of user response:`, error);
                    }
                }
            }
        } catch (error) {
            console.error(`Error notifying agents of user response for request ${requestId}:`, error);
        }
    }
}

new PostOffice();
