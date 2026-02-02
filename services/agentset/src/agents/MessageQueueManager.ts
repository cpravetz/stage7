import * as amqp from 'amqplib';
import * as amqp_connection_manager from 'amqp-connection-manager';
import { AgentStatus } from '../utils/agentStatus';

/**
 * Interface for the context needed by MessageQueueManager
 */
export interface MessageQueueAgentContext {
    id: string;
    setAgentStatus: (status: AgentStatus, logData: any) => Promise<void>;
}

/**
 * Manages RabbitMQ connection and messaging for agents
 */
export class MessageQueueManager {
    private connection: amqp_connection_manager.AmqpConnectionManager | null = null;
    private channel: amqp_connection_manager.ChannelWrapper | null = null;
    private agent: MessageQueueAgentContext;
    private rabbitmqUrl: string;

    constructor(agent: MessageQueueAgentContext) {
        this.agent = agent;
        this.rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://stage7:stage7password@rabbitmq:5672';
    }

    /**
     * Get the channel for publishing messages
     */
    public getChannel(): amqp_connection_manager.ChannelWrapper | null {
        return this.channel;
    }

    /**
     * Check if the connection is established
     */
    public isConnected(): boolean {
        return this.connection !== null && this.channel !== null;
    }

    /**
     * Initialize RabbitMQ connection and channel
     */
    public async initialize(): Promise<void> {
        try {
            this.connection = amqp_connection_manager.connect([this.rabbitmqUrl]);

            this.connection.on('connect', () => console.log(`Agent ${this.agent.id} connected to RabbitMQ!`));
            this.connection.on('disconnect', async (err) => {
                console.error(`Agent ${this.agent.id} disconnected from RabbitMQ. Attempting to re-initialize...`, err);
                await this.reinitialize();
            });

            this.channel = this.connection.createChannel({
                json: true,
                setup: async (channel: amqp.Channel) => {
                    await channel.assertExchange('agent.events', 'topic', { durable: true });
                    console.log(`Agent ${this.agent.id} asserted 'agent.events' exchange.`);
                },
            });

            this.channel.on('error', async (err) => {
                console.error(`Agent ${this.agent.id} RabbitMQ channel error. Attempting to re-initialize...`, err);
                await this.reinitialize();
            });

        } catch (error) {
            console.error(`Error initializing RabbitMQ for Agent ${this.agent.id}:`, error);
        }
    }

    /**
     * Re-initialize the RabbitMQ connection with exponential backoff
     */
    private async reinitialize(): Promise<void> {
        console.log(`Agent ${this.agent.id} re-initializing RabbitMQ connection and channel.`);
        
        // Clear existing connection and channel
        if (this.connection) {
            try {
                await this.connection.close();
            } catch (e) {
                console.warn(`Error closing old RabbitMQ connection for Agent ${this.agent.id}:`, e);
            }
        }
        this.connection = null;
        this.channel = null;

        // Implement a backoff strategy before attempting to reconnect
        const MAX_RECONNECT_ATTEMPTS = 5;
        let attempt = 0;
        
        while (attempt < MAX_RECONNECT_ATTEMPTS) {
            try {
                console.log(`Agent ${this.agent.id} attempting RabbitMQ reconnect (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
                await this.initialize();
                console.log(`Agent ${this.agent.id} successfully reconnected to RabbitMQ.`);
                return;
            } catch (error) {
                console.error(`Agent ${this.agent.id} RabbitMQ reconnection failed on attempt ${attempt + 1}:`, error);
                attempt++;
                const delay = Math.min(Math.pow(2, attempt) * 1000, 30000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        console.error(`Agent ${this.agent.id} failed to reconnect to RabbitMQ after ${MAX_RECONNECT_ATTEMPTS} attempts. RabbitMQ functionality may be impaired.`);
        await this.agent.setAgentStatus(AgentStatus.ERROR, { eventType: 'rabbitmq_reconnect_failed', details: 'Failed to reconnect to RabbitMQ' });
    }

    /**
     * Publish a message to RabbitMQ
     */
    public publish(exchange: string, routingKey: string, message: any): boolean {
        if (!this.channel) {
            console.warn(`Agent ${this.agent.id} RabbitMQ channel not available, cannot publish.`);
            return false;
        }
        this.channel.publish(exchange, routingKey, message);
        return true;
    }

    /**
     * Clean up resources
     */
    public async cleanup(): Promise<void> {
        try {
            if (this.channel) {
                await this.channel.close();
                this.channel = null;
            }
            if (this.connection) {
                await this.connection.close();
                this.connection = null;
            }
        } catch (error) {
            console.error(`Error during MessageQueueManager cleanup for Agent ${this.agent.id}:`, error);
        }
    }
}
