/**
 * Redis Transport implementation
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
 * Redis implementation of the Transport interface
 */
export class RedisTransport extends Transport {
    constructor() {
        super('Redis');
        this.client = null;
        this.pubClient = null;
        this.subClient = null;
        this.subscriptions = new Map(); // Map of subscription patterns to handlers
        this.requestMap = new Map(); // For request-response pattern
    }
    
    /**
     * Connect to Redis
     * @param {Object} config - Redis connection configuration
     * @returns {Promise<any>} - The Redis connection client
     */
    async connect(config) {
        if (this.connected && this.client) {
            return this.client;
        }
        
        try {
            // Implementation will depend on the Redis client library used
            // For example, with ioredis:
            // this.client = new Redis(config);
            // this.pubClient = new Redis(config);
            // this.subClient = new Redis(config);
            
            // Set up subscription handling
            // this.subClient.on('message', (channel, message) => {
            //     const handler = this.subscriptions.get(channel);
            //     if (handler) {
            //         handler(channel, message);
            //     }
            // });
            
            this.connected = true;
            return this.client;
        } catch (error) {
            throw new TransportError(
                `Failed to connect to Redis: ${error.message}`,
                this.transportType,
                { details: error.message }
            );
        }
    }
    
    /**
     * Disconnect from Redis
     * @returns {Promise<void>}
     */
    async disconnect() {
        await super.disconnect();
        
        try {
            if (this.client) await this.client.quit();
            if (this.pubClient) await this.pubClient.quit();
            if (this.subClient) await this.subClient.quit();
            
            this.client = null;
            this.pubClient = null;
            this.subClient = null;
            this.subscriptions.clear();
        } catch (error) {
            logger.warn('Error disconnecting from Redis', { error });
        }
    }
    
    /**
     * Publish a message to a Redis channel
     * @param {string} channel - The channel to publish to
     * @param {string} message - The message to publish
     * @returns {Promise<void>}
     */
    async publish(channel, message) {
        if (!this.connected || !this.pubClient) {
            throw new TransportError(
                'Cannot publish: not connected to Redis',
                this.transportType
            );
        }
        
        try {
            // await this.pubClient.publish(channel, message);
        } catch (error) {
            throw new TransportError(
                `Failed to publish to channel ${channel}: ${error.message}`,
                this.transportType,
                { channel }
            );
        }
    }
    
    /**
     * Subscribe to a Redis channel
     * @param {string} channel - The channel to subscribe to
     * @param {Object} options - Subscription options
     * @returns {Promise<string>} - The subscription identifier
     */
    async subscribe(channel, options = {}, handler = null) {
        if (!this.connected || !this.subClient) {
            throw new TransportError(
                'Cannot subscribe: not connected to Redis',
                this.transportType
            );
        }
        
        try {
            // await this.subClient.subscribe(channel);
            
            if (handler) {
                this.subscriptions.set(channel, handler);
            }
            
            return channel; // Return the channel as the subscription ID
        } catch (error) {
            throw new TransportError(
                `Failed to subscribe to channel ${channel}: ${error.message}`,
                this.transportType,
                { channel }
            );
        }
    }
    
    /**
     * Unsubscribe from a Redis channel
     * @param {string} channel - The channel to unsubscribe from
     * @returns {Promise<void>}
     */
    async unsubscribe(channel) {
        if (!this.connected || !this.subClient) {
            return; // Already disconnected
        }
        
        try {
            // await this.subClient.unsubscribe(channel);
            this.subscriptions.delete(channel);
        } catch (error) {
            logger.warn(`Error unsubscribing from channel ${channel}`, { error });
        }
    }
    
    /**
     * Send a request and wait for a response
     * Implements request-response pattern using Redis PubSub and unique reply channels
     * @param {string} target - The target channel
     * @param {string} message - The message to send
     * @param {Object} options - Request options
     * @returns {Promise<any>} - The response
     */
    async request(target, message, options = {}) {
        if (!this.connected || !this.pubClient || !this.subClient) {
            throw new TransportError(
                'Cannot send request: not connected to Redis',
                this.transportType
            );
        }
        
        const correlationId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const replyChannel = `${target}_reply_${correlationId}`;
        const timeout = options.timeout || TIMEOUT_TASK_REQUEST;
        
        try {
            // Create a promise that will be resolved when the response is received
            const responsePromise = new Promise((resolve, reject) => {
                // Set a timeout
                const timeoutId = setTimeout(() => {
                    this.unsubscribe(replyChannel).catch(() => {});
                    this.requestMap.delete(correlationId);
                    reject(new TimeoutError(`Request to ${target} timed out after ${timeout}ms`));
                }, timeout);
                
                // Store the resolver and timeout
                this.requestMap.set(correlationId, {
                    resolve,
                    reject,
                    timeoutId
                });
                
                // Set up a handler for the reply
                const replyHandler = (channel, reply) => {
                    const requestData = this.requestMap.get(correlationId);
                    if (requestData) {
                        clearTimeout(requestData.timeoutId);
                        this.requestMap.delete(correlationId);
                        this.unsubscribe(replyChannel).catch(() => {});
                        resolve({ string: () => reply });
                    }
                };
                
                // Subscribe to the reply channel
                this.subscribe(replyChannel, {}, replyHandler).catch(reject);
                
                // Send the request as JSON with correlation ID and reply channel
                const requestData = JSON.stringify({
                    data: message,
                    metadata: {
                        correlationId,
                        replyChannel
                    }
                });
                
                this.publish(target, requestData).catch(reject);
            });
            
            // Wait for the response
            return await responsePromise;
        } catch (error) {
            // Clean up
            this.unsubscribe(replyChannel).catch(() => {});
            const requestData = this.requestMap.get(correlationId);
            if (requestData) {
                clearTimeout(requestData.timeoutId);
                this.requestMap.delete(correlationId);
            }
            
            throw new TransportError(
                `Request to ${target} failed: ${error.message}`,
                this.transportType,
                { target }
            );
        }
    }
    
    /**
     * Set up discovery subscription
     * @param {string} discoveryChannel - The channel for discovery messages
     * @param {string} namespace - The agent namespace
     * @param {string} agentName - The agent name
     * @param {Object} discoveredAgents - Map to store discovered agents
     * @param {Array} acceptedNetworks - List of accepted networks
     * @returns {Promise<void>}
     */
    async setupDiscoverySubscription(discoveryChannel, namespace, agentName, discoveredAgents, acceptedNetworks) {
        try {
            // Process discovery message handler
            const discoveryHandler = async (channel, message) => {
                try {
                    // Parse and validate the discovery message
                    let discoveryMessage;
                    try {
                        discoveryMessage = DiscoveryMessage.fromString(message);
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
                                                const req = await this.request(
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
            
            // Subscribe to discovery channel
            await this.subscribe(discoveryChannel, {}, discoveryHandler);
            logger.info(`Agent ${agentName} subscribed to discovery channel ${discoveryChannel}`);
        } catch (error) {
            throw new DiscoveryError(
                `Failed to set up discovery subscription on channel ${discoveryChannel}`,
                { agentName, channel: discoveryChannel },
                error
            );
        }
    }
    
    /**
     * Set up task handler for processing incoming requests
     * @param {string} agentName - The agent name (used as the channel)
     * @param {Function} processingFunction - The function to process requests
     * @returns {Promise<void>}
     */
    async setupTaskHandler(agentName, processingFunction) {
        try {
            const taskHandler = async (channel, message) => {
                try {
                    // Parse the request message
                    const request = JSON.parse(message);
                    const payload = JSON.parse(request.data);
                    const metadata = request.metadata || {};
                    const replyChannel = metadata.replyChannel;
                    
                    // Process the message using the Message class
                    const msg = new Message(payload);
                    
                    // Process the task with timeout
                    const response = await withTimeout(
                        async () => processingFunction(msg),
                        TIMEOUT_TASK_REQUEST * 2,
                        `task processing for ${agentName}`
                    );
                    
                    // Send response back if reply channel is available
                    if (replyChannel) {
                        await this.publish(replyChannel, response.serialize());
                    }
                } catch (error) {
                    logger.error("Error processing task", { error, agentName, channel });
                    
                    // Send error response back if reply channel is available
                    const request = JSON.parse(message);
                    const metadata = request.metadata || {};
                    const replyChannel = metadata.replyChannel;
                    
                    if (replyChannel) {
                        await this.publish(replyChannel, JSON.stringify({
                            error: true,
                            message: error.message,
                            type: error.name || 'Error'
                        }));
                    }
                }
            };
            
            // Subscribe to the agent's channel for tasks
            await this.subscribe(agentName, {}, taskHandler);
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
     * Creates a runtime for agent communication using Redis
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
                    'Missing required Redis configuration: discoveryTopic',
                    this.transportType,
                    { agentName }
                );
            }
            
            const discoveryChannel = config.bindings.discoveryTopic;
            const acceptedNetworks = config.bindings.acceptedNetworks || [];
            logger.info(`Agent ${agentName} initialized with discovery channel ${discoveryChannel}`);
            
            // Step 1: Subscribe to discovery channel
            await this.setupDiscoverySubscription(discoveryChannel, namespace, agentName, discoveredAgents, acceptedNetworks);
            
            // Step 2: Set up heartbeat
            this.setupHeartbeat(discoveryChannel, namespace, agentName, discoverySchemas, HEARTBEAT_INTERVAL);
            
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
                    `Failed to initialize Redis runtime: ${error.message}`,
                    this.transportType,
                    { agentName }
                );
            }
            
            logger.error("Redis runtime initialization failed", { error, agentName });
            throw error;
        }
    }
}

/**
 * Factory function to create a Redis transport instance
 * @returns {RedisTransport} - A Redis transport instance
 */
export function createRedisTransport() {
    return new RedisTransport();
}

/**
 * Adapter function to create a Redis-based runtime for agent communication
 * @param {string} namespace - The agent namespace
 * @param {string} agentName - The agent name
 * @param {Array} ioInterfaces - The IO interfaces (only the first one is used)
 * @param {Array} discoverySchemas - The agent capability schemas for discovery
 * @returns {Promise<Object>} - The runtime { handleTask, discoveredAgents }
 */
export async function RedisIOAgentRuntime(namespace, agentName, ioInterfaces, discoverySchemas) {
    if (ioInterfaces.length > 1) {
        throw new TransportError(
            'Only one IO Redis interface is supported',
            'Redis',
            { agentName, interfacesCount: ioInterfaces.length }
        );
    }
    
    if (ioInterfaces.length === 0) {
        logger.warn(`No Redis interfaces provided for agent ${agentName}, creating passive runtime`);
        return { handleTask: async () => {}, discoveredAgents: {} };
    }
    
    const io = ioInterfaces[0];
    const transport = createRedisTransport();
    
    try {
        // Connect to Redis with retry logic
        logger.info(`Connecting to Redis for agent ${agentName}`);
        await safeConnect(transport, io.config);
        
        // Create runtime with the transport
        return await transport.createRuntime(namespace, agentName, discoverySchemas, io.config);
    } catch (error) {
        // Make sure to clean up if initialization fails
        await transport.disconnect();
        throw error;
    }
} 