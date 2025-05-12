/**
 * RabbitMQ Transport implementation
 */
import { Transport, DiscoveryMessage, safeConnect } from './base.js';
import { Message } from '../index.js';
import { logger } from '../utils/logger.js';
import { 
  TransportError, 
  DiscoveryError, 
  HandoffError, 
  TimeoutError,
  withTimeout
} from '../errors/index.js';

// Constants
const HEARTBEAT_INTERVAL = 1000;
const TIMEOUT_TASK_REQUEST = 60000;

/**
 * RabbitMQ implementation of the Transport interface
 */
export class RabbitMQTransport extends Transport {
    constructor() {
        super('RabbitMQ');
        this.connection = null;
        this.channel = null;
        this.subscriptions = new Map(); // Map of subscription queues to consumers
        this.requestMap = new Map(); // For request-response pattern
    }
    
    /**
     * Connect to RabbitMQ
     * @param {Object} config - RabbitMQ connection configuration
     * @returns {Promise<any>} - The RabbitMQ connection
     */
    async connect(config) {
        if (this.connected && this.connection) {
            return this.connection;
        }
        
        try {
            // Implementation will depend on the RabbitMQ client library used
            // For example, with amqplib:
            // const amqp = require('amqplib');
            // const { url, options } = config;
            //
            // this.connection = await amqp.connect(url, options);
            // this.channel = await this.connection.createChannel();
            //
            // // Set prefetch to handle one message at a time
            // await this.channel.prefetch(1);
            //
            // // Handle connection close events
            // this.connection.on('close', () => {
            //     this.connected = false;
            //     logger.warn('RabbitMQ connection closed');
            // });
            
            this.connected = true;
            return this.connection;
        } catch (error) {
            throw new TransportError(
                `Failed to connect to RabbitMQ: ${error.message}`,
                this.transportType,
                { details: error.message }
            );
        }
    }
    
    /**
     * Disconnect from RabbitMQ
     * @returns {Promise<void>}
     */
    async disconnect() {
        await super.disconnect();
        
        try {
            // Close the channel and connection
            if (this.channel) await this.channel.close();
            if (this.connection) await this.connection.close();
            
            this.channel = null;
            this.connection = null;
            this.subscriptions.clear();
        } catch (error) {
            logger.warn('Error disconnecting from RabbitMQ', { error });
        }
    }
    
    /**
     * Ensure exchange exists
     * @param {string} exchange - The exchange name
     * @param {string} type - The exchange type (direct, fanout, topic)
     * @returns {Promise<void>}
     */
    async ensureExchange(exchange, type = 'topic') {
        if (!this.connected || !this.channel) {
            throw new TransportError(
                'Cannot ensure exchange: not connected to RabbitMQ',
                this.transportType
            );
        }
        
        try {
            // await this.channel.assertExchange(exchange, type, { durable: true });
        } catch (error) {
            throw new TransportError(
                `Failed to assert exchange ${exchange}: ${error.message}`,
                this.transportType,
                { exchange }
            );
        }
    }
    
    /**
     * Ensure queue exists
     * @param {string} queue - The queue name
     * @param {Object} options - Queue options
     * @returns {Promise<Object>} - The queue information
     */
    async ensureQueue(queue, options = {}) {
        if (!this.connected || !this.channel) {
            throw new TransportError(
                'Cannot ensure queue: not connected to RabbitMQ',
                this.transportType
            );
        }
        
        try {
            // return await this.channel.assertQueue(queue, { 
            //     durable: true,
            //     ...options
            // });
        } catch (error) {
            throw new TransportError(
                `Failed to assert queue ${queue}: ${error.message}`,
                this.transportType,
                { queue }
            );
        }
    }
    
    /**
     * Bind a queue to an exchange
     * @param {string} queue - The queue name
     * @param {string} exchange - The exchange name
     * @param {string} routingKey - The routing key
     * @returns {Promise<void>}
     */
    async bindQueue(queue, exchange, routingKey) {
        if (!this.connected || !this.channel) {
            throw new TransportError(
                'Cannot bind queue: not connected to RabbitMQ',
                this.transportType
            );
        }
        
        try {
            // await this.channel.bindQueue(queue, exchange, routingKey);
        } catch (error) {
            throw new TransportError(
                `Failed to bind queue ${queue} to exchange ${exchange}: ${error.message}`,
                this.transportType,
                { queue, exchange, routingKey }
            );
        }
    }
    
    /**
     * Publish a message to a RabbitMQ exchange
     * @param {string} exchange - The exchange to publish to
     * @param {string} routingKey - The routing key
     * @param {string} message - The message to publish
     * @param {Object} options - Publish options
     * @returns {Promise<void>}
     */
    async publish(exchange, routingKey, message, options = {}) {
        if (!this.connected || !this.channel) {
            throw new TransportError(
                'Cannot publish: not connected to RabbitMQ',
                this.transportType
            );
        }
        
        try {
            // Ensure the exchange exists
            await this.ensureExchange(exchange);
            
            // Convert string to Buffer if needed
            const content = Buffer.isBuffer(message) ? message : Buffer.from(message);
            
            // await this.channel.publish(exchange, routingKey, content, {
            //     persistent: true,
            //     ...options
            // });
        } catch (error) {
            throw new TransportError(
                `Failed to publish to exchange ${exchange} with routing key ${routingKey}: ${error.message}`,
                this.transportType,
                { exchange, routingKey }
            );
        }
    }
    
    /**
     * Subscribe to a RabbitMQ queue
     * @param {string} queue - The queue to subscribe to
     * @param {string} exchange - The exchange (if binding is needed)
     * @param {string} routingKey - The routing key (if binding is needed)
     * @param {Object} options - Subscription options
     * @returns {Promise<string>} - The consumer tag
     */
    async subscribe(queue, exchange = null, routingKey = null, options = {}) {
        if (!this.connected || !this.channel) {
            throw new TransportError(
                'Cannot subscribe: not connected to RabbitMQ',
                this.transportType
            );
        }
        
        try {
            // Ensure the queue exists
            await this.ensureQueue(queue, options.queue || {});
            
            // If exchange and routing key are provided, bind the queue
            if (exchange && routingKey) {
                await this.ensureExchange(exchange);
                await this.bindQueue(queue, exchange, routingKey);
            }
            
            // Create the consumer
            // const { consumerTag } = await this.channel.consume(
            //     queue,
            //     (msg) => {
            //         if (msg === null) {
            //             // Consumer cancelled by server
            //             logger.warn(`Consumer for queue ${queue} was cancelled by the server`);
            //             this.subscriptions.delete(queue);
            //             return;
            //         }
            //         
            //         const content = msg.content.toString();
            //         const handler = options.messageHandler;
            //         
            //         if (handler) {
            //             Promise.resolve(handler(content, msg)).then(() => {
            //                 // Acknowledge message after successful processing
            //                 this.channel.ack(msg);
            //             }).catch((error) => {
            //                 logger.error(`Error processing message from queue ${queue}`, { error });
            //                 // Reject the message and requeue it
            //                 this.channel.nack(msg, false, true);
            //             });
            //         } else {
            //             // No handler, just acknowledge
            //             this.channel.ack(msg);
            //         }
            //     },
            //     { noAck: false }
            // );
            
            // Store the consumer
            // this.subscriptions.set(queue, consumerTag);
            
            const consumerTag = `consumer_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            this.subscriptions.set(queue, consumerTag);
            return consumerTag;
        } catch (error) {
            throw new TransportError(
                `Failed to subscribe to queue ${queue}: ${error.message}`,
                this.transportType,
                { queue, exchange, routingKey }
            );
        }
    }
    
    /**
     * Unsubscribe from a RabbitMQ queue
     * @param {string} queue - The queue to unsubscribe from
     * @returns {Promise<void>}
     */
    async unsubscribe(queue) {
        if (!this.connected || !this.channel) {
            return; // Already disconnected
        }
        
        try {
            const consumerTag = this.subscriptions.get(queue);
            if (consumerTag) {
                // await this.channel.cancel(consumerTag);
                this.subscriptions.delete(queue);
            }
        } catch (error) {
            logger.warn(`Error unsubscribing from queue ${queue}`, { error });
        }
    }
    
    /**
     * Send a request and wait for a response
     * Implements request-response pattern using RabbitMQ and temp reply queues
     * @param {string} exchange - The exchange to use
     * @param {string} routingKey - The routing key (usually the service name)
     * @param {string} message - The message to send
     * @param {Object} options - Request options
     * @returns {Promise<any>} - The response
     */
    async request(exchange, routingKey, message, options = {}) {
        if (!this.connected || !this.channel) {
            throw new TransportError(
                'Cannot send request: not connected to RabbitMQ',
                this.transportType
            );
        }
        
        const correlationId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const timeout = options.timeout || TIMEOUT_TASK_REQUEST;
        
        try {
            // Create a temporary exclusive queue for the response
            // const { queue: replyQueue } = await this.channel.assertQueue('', {
            //     exclusive: true,
            //     autoDelete: true
            // });
            const replyQueue = `reply_${correlationId}`;
            
            // Create a promise that will be resolved when the response is received
            const responsePromise = new Promise((resolve, reject) => {
                // Set a timeout
                const timeoutId = setTimeout(() => {
                    this.unsubscribe(replyQueue).catch(() => {});
                    this.requestMap.delete(correlationId);
                    reject(new TimeoutError(`Request to ${routingKey} timed out after ${timeout}ms`));
                }, timeout);
                
                // Store the resolver and timeout
                this.requestMap.set(correlationId, {
                    resolve,
                    reject,
                    timeoutId
                });
                
                // Set up handler for the reply
                const messageHandler = (content, msg) => {
                    const requestData = this.requestMap.get(correlationId);
                    if (requestData && msg.properties.correlationId === correlationId) {
                        clearTimeout(requestData.timeoutId);
                        this.requestMap.delete(correlationId);
                        this.unsubscribe(replyQueue).catch(() => {});
                        resolve({ string: () => content });
                        return true; // Handled the message
                    }
                    return false; // Not handled
                };
                
                // Subscribe to the reply queue
                this.subscribe(replyQueue, null, null, { 
                    queue: { exclusive: true, autoDelete: true },
                    messageHandler
                }).catch(reject);
                
                // Publish the request
                const content = Buffer.from(message);
                // this.channel.publish(exchange, routingKey, content, {
                //     persistent: true,
                //     correlationId,
                //     replyTo: replyQueue,
                //     expiration: timeout.toString()
                // });
            });
            
            // Wait for the response
            return await responsePromise;
        } catch (error) {
            // Clean up
            const requestData = this.requestMap.get(correlationId);
            if (requestData) {
                clearTimeout(requestData.timeoutId);
                this.requestMap.delete(correlationId);
            }
            
            throw new TransportError(
                `Request to ${routingKey} failed: ${error.message}`,
                this.transportType,
                { exchange, routingKey }
            );
        }
    }
    
    /**
     * Set up discovery subscription
     * @param {string} discoveryExchange - The exchange for discovery messages
     * @param {string} namespace - The agent namespace
     * @param {string} agentName - The agent name
     * @param {Object} discoveredAgents - Map to store discovered agents
     * @param {Array} acceptedNetworks - List of accepted networks
     * @returns {Promise<void>}
     */
    async setupDiscoverySubscription(discoveryExchange, namespace, agentName, discoveredAgents, acceptedNetworks) {
        const discoveryQueue = `discovery_${namespace}_${agentName}`;
        
        try {
            // Process discovery message handler
            const messageHandler = async (content, msg) => {
                try {
                    // Parse and validate the discovery message
                    let discoveryMessage;
                    try {
                        discoveryMessage = DiscoveryMessage.fromString(content);
                    } catch (parseError) {
                        logger.warn('Invalid discovery message format', { error: parseError.message });
                        return;
                    }
                    
                    const network = discoveryMessage.network;
                    const networkNamespace = network.split(".")[0];
                    const networkName = network.split(".")[1];
                    
                    // Skip self
                    if (network === `${namespace}.${agentName}`) {
                        return;
                    }
                    
                    // Check if network is accepted
                    let isAccepted = false;
                    for (const acceptedNetwork of acceptedNetworks) {
                        const acceptedNetworkNamespace = acceptedNetwork.split(".")[0];
                        const acceptedNetworkName = acceptedNetwork.split(".")[1];
                        
                        if (
                            (acceptedNetworkNamespace === '*' || acceptedNetworkNamespace === networkNamespace) &&
                            (acceptedNetworkName === '*' || acceptedNetworkName === networkName)
                        ) {
                            isAccepted = true;
                            break;
                        }
                    }
                    
                    if (!isAccepted) {
                        logger.warn(`Agent ${agentName} does not accept network ${network}`);
                        return;
                    }
                    
                    // Process the schemas from the discovery message
                    for (const schema of discoveryMessage.schemas) {
                        // Skip invalid schemas
                        if (!schema || !schema.name) {
                            logger.warn('Invalid schema in discovery payload', { schema });
                            continue;
                        }
                        
                        const agentKey = `${network}-${schema.name}`;
                        
                        if (discoveryMessage.agentName !== agentName && !discoveredAgents[agentKey]) {
                            logger.info(`${agentName} discovered agent capability: ${discoveryMessage.agentName} with capability ${schema.name}`);
                            
                            const handoffFunction = async (conversation, state, input) => {
                                try {
                                    // Use withTimeout to ensure handoffs don't hang
                                    return await withTimeout(
                                        async () => {
                                            try {
                                                const message = new Message({ 
                                                    session: state,
                                                    content: input
                                                });
                                                // Exchange is set to direct for point-to-point communication
                                                const req = await this.request(
                                                    'direct', 
                                                    discoveryMessage.agentName, 
                                                    message.serialize(), 
                                                    { timeout: TIMEOUT_TASK_REQUEST }
                                                );
                                                return req.string();
                                            } catch (error) {
                                                throw new HandoffError(
                                                    `Handoff to agent ${discoveryMessage.agentName} failed: ${error.message}`,
                                                    agentName,
                                                    discoveryMessage.agentName,
                                                    { schemaName: schema.name }
                                                );
                                            }
                                        },
                                        TIMEOUT_TASK_REQUEST,
                                        `handoff to ${discoveryMessage.agentName}`
                                    );
                                } catch (error) {
                                    logger.error(`Handoff error to ${discoveryMessage.agentName}`, {
                                        error,
                                        schema: schema.name
                                    });
                                    throw error;
                                }
                            };
                            
                            discoveredAgents[agentKey] = {
                                name: schema.name, 
                                schema: schema, 
                                function: handoffFunction
                            };
                        }
                    }
                } catch (error) {
                    logger.error('Error processing discovery message', { error });
                }
            };
            
            // Subscribe to discovery queue with binding to the exchange
            await this.subscribe(
                discoveryQueue, 
                discoveryExchange, 
                '#', // Listen to all routing keys
                { messageHandler }
            );
            
            logger.info(`Agent ${agentName} subscribed to discovery exchange ${discoveryExchange}`);
        } catch (error) {
            throw new DiscoveryError(
                `Failed to set up discovery subscription on exchange ${discoveryExchange}`,
                { agentName, exchange: discoveryExchange },
                error
            );
        }
    }
    
    /**
     * Set up task handler for processing incoming requests
     * @param {string} agentName - The agent name (used as the routing key)
     * @param {Function} processingFunction - The function to process requests
     * @returns {Promise<void>}
     */
    async setupTaskHandler(agentName, processingFunction) {
        const taskQueue = `tasks_${agentName}`;
        
        try {
            // Process task message handler
            const messageHandler = async (content, msg) => {
                try {
                    // Parse and validate the payload
                    const payload = JSON.parse(content);
                    if (!payload || typeof payload !== 'object') {
                        throw new Error('Invalid payload: not a JSON object');
                    }
                    
                    // Process the message using the Message class
                    const message = new Message(payload);
                    
                    // Process the task with timeout
                    const response = await withTimeout(
                        async () => processingFunction(message),
                        TIMEOUT_TASK_REQUEST * 2,
                        `task processing for ${agentName}`
                    );
                    
                    // Send response back if reply information is available
                    if (msg.properties.replyTo && msg.properties.correlationId) {
                        const replyContent = Buffer.from(response.serialize());
                        // await this.channel.sendToQueue(
                        //     msg.properties.replyTo,
                        //     replyContent,
                        //     { correlationId: msg.properties.correlationId }
                        // );
                    }
                } catch (error) {
                    logger.error("Error processing task", {
                        error,
                        agentName,
                        queue: taskQueue
                    });
                    
                    // Send error response back if reply information is available
                    if (msg.properties.replyTo && msg.properties.correlationId) {
                        const errorContent = Buffer.from(JSON.stringify({
                            error: true,
                            message: error.message,
                            type: error.name || 'Error'
                        }));
                        // await this.channel.sendToQueue(
                        //     msg.properties.replyTo,
                        //     errorContent,
                        //     { correlationId: msg.properties.correlationId }
                        // );
                    }
                }
            };
            
            // Set up direct exchange for the agent
            await this.ensureExchange('direct', 'direct');
            
            // Subscribe to the task queue with binding to the direct exchange
            await this.subscribe(
                taskQueue, 
                'direct', 
                agentName, 
                { messageHandler }
            );
            
            logger.info(`Agent ${agentName} subscribed for task handling`);
        } catch (error) {
            throw new TransportError(
                `Failed to set up task handler for ${agentName}: ${error.message}`,
                this.transportType,
                { agentName }
            );
        }
    }
    
    /**
     * Creates a runtime for agent communication using RabbitMQ
     * @param {string} namespace - The agent namespace
     * @param {string} agentName - The agent name
     * @param {Array} discoverySchemas - The agent capability schemas for discovery
     * @param {Object} config - Additional configuration
     * @returns {Promise<Object>} - The runtime { handleTask, discoveredAgents }
     */
    async createRuntime(namespace, agentName, discoverySchemas, config) {
        const discoveredAgents = {};
        
        try {
            // Verify configuration
            if (!config || !config.bindings || !config.bindings.discoveryTopic) {
                throw new TransportError(
                    'Missing required RabbitMQ configuration: discoveryTopic',
                    this.transportType,
                    { agentName }
                );
            }
            
            const discoveryExchange = config.bindings.discoveryTopic;
            const acceptedNetworks = config.bindings.acceptedNetworks || [];
            logger.info(`Agent ${agentName} initialized with discovery exchange ${discoveryExchange}`);
            
            // Set up exchanges
            await this.ensureExchange(discoveryExchange, 'topic');
            
            // Step 1: Subscribe to discovery exchange
            await this.setupDiscoverySubscription(discoveryExchange, namespace, agentName, discoveredAgents, acceptedNetworks);
            
            // Step 2: Set up heartbeat using the exchange
            // For RabbitMQ we use the setup heartbeat with exchange and agent as the routing key
            this.intervals.push(setInterval(async () => {
                try {
                    const discoveryMessage = new DiscoveryMessage(namespace, agentName, discoverySchemas);
                    await this.publish(discoveryExchange, agentName, discoveryMessage.serialize());
                } catch (error) {
                    logger.error(`Failed to publish heartbeat for ${agentName}`, {
                        error,
                        transportType: this.transportType
                    });
                }
            }, HEARTBEAT_INTERVAL));
            
            // Step 3: Create task handler function
            const handleTask = async (fn) => {
                if (typeof fn !== 'function') {
                    throw new Error('Task handler must be a function');
                }
                await this.setupTaskHandler(agentName, fn);
            };
            
            return { handleTask, discoveredAgents };
        } catch (error) {
            // Enhance the error with context if it's not already a TransportError
            if (!(error instanceof TransportError)) {
                error = new TransportError(
                    `Failed to initialize RabbitMQ runtime: ${error.message}`,
                    this.transportType,
                    { agentName }
                );
            }
            
            logger.error("RabbitMQ runtime initialization failed", { error, agentName });
            throw error;
        }
    }
}

/**
 * Factory function to create a RabbitMQ transport instance
 * @returns {RabbitMQTransport} - A RabbitMQ transport instance
 */
export function createRabbitMQTransport() {
    return new RabbitMQTransport();
}

/**
 * Adapter function to create a RabbitMQ-based runtime for agent communication
 * @param {string} namespace - The agent namespace
 * @param {string} agentName - The agent name
 * @param {Array} ioInterfaces - The IO interfaces (only the first one is used)
 * @param {Array} discoverySchemas - The agent capability schemas for discovery
 * @returns {Promise<Object>} - The runtime { handleTask, discoveredAgents }
 */
export async function RabbitMQIOAgentRuntime(namespace, agentName, ioInterfaces, discoverySchemas) {
    if (ioInterfaces.length > 1) {
        throw new TransportError(
            'Only one IO RabbitMQ interface is supported',
            'RabbitMQ',
            { agentName, interfacesCount: ioInterfaces.length }
        );
    }
    
    if (ioInterfaces.length === 0) {
        logger.warn(`No RabbitMQ interfaces provided for agent ${agentName}, creating passive runtime`);
        return { handleTask: async () => {}, discoveredAgents: {} };
    }
    
    const io = ioInterfaces[0];
    const transport = createRabbitMQTransport();
    
    try {
        // Connect to RabbitMQ with retry logic
        logger.info(`Connecting to RabbitMQ for agent ${agentName}`);
        await safeConnect(transport, io.config);
        
        // Create runtime with the transport
        return await transport.createRuntime(namespace, agentName, discoverySchemas, io.config);
    } catch (error) {
        // Make sure to clean up if initialization fails
        await transport.disconnect();
        throw error;
    }
} 