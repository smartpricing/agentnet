/**
 * Kafka Transport implementation
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
 * Kafka implementation of the Transport interface
 */
export class KafkaTransport extends Transport {
    constructor() {
        super('Kafka');
        this.producer = null;
        this.consumer = null;
        this.admin = null;
        this.requestMap = new Map(); // For request-response pattern
    }
    
    /**
     * Connect to Kafka
     * @param {Object} config - Kafka connection configuration
     * @returns {Promise<any>} - The Kafka connection objects
     */
    async connect(config) {
        if (this.connected) {
            return { producer: this.producer, consumer: this.consumer };
        }
        
        try {
            // Implementation will depend on the Kafka client library used
            // For example, with KafkaJS:
            // this.producer = kafka.producer();
            // this.consumer = kafka.consumer({ groupId: config.groupId });
            // this.admin = kafka.admin();
            
            // await this.producer.connect();
            // await this.consumer.connect();
            // await this.admin.connect();
            
            this.connected = true;
            return { producer: this.producer, consumer: this.consumer };
        } catch (error) {
            throw new TransportError(
                `Failed to connect to Kafka: ${error.message}`,
                this.transportType,
                { details: error.message }
            );
        }
    }
    
    /**
     * Disconnect from Kafka
     * @returns {Promise<void>}
     */
    async disconnect() {
        await super.disconnect();
        
        try {
            // Disconnect all clients
            if (this.producer) await this.producer.disconnect();
            if (this.consumer) await this.consumer.disconnect();
            if (this.admin) await this.admin.disconnect();
            
            this.producer = null;
            this.consumer = null;
            this.admin = null;
        } catch (error) {
            logger.warn('Error disconnecting from Kafka', { error });
        }
    }
    
    /**
     * Publish a message to a Kafka topic
     * @param {string} topic - The topic to publish to
     * @param {string} message - The message to publish
     * @returns {Promise<void>}
     */
    async publish(topic, message) {
        if (!this.connected || !this.producer) {
            throw new TransportError(
                'Cannot publish: not connected to Kafka',
                this.transportType
            );
        }
        
        try {
            // Example with KafkaJS:
            // await this.producer.send({
            //     topic,
            //     messages: [{ value: message }]
            // });
        } catch (error) {
            throw new TransportError(
                `Failed to publish to topic ${topic}: ${error.message}`,
                this.transportType,
                { topic }
            );
        }
    }
    
    /**
     * Subscribe to a Kafka topic
     * @param {string} topic - The topic to subscribe to
     * @param {Object} options - Subscription options
     * @returns {Promise<any>} - The subscription identifier
     */
    async subscribe(topic, options = {}) {
        if (!this.connected || !this.consumer) {
            throw new TransportError(
                'Cannot subscribe: not connected to Kafka',
                this.transportType
            );
        }
        
        try {
            // Example with KafkaJS:
            // await this.consumer.subscribe({ topic, fromBeginning: false });
            // Create a unique subscription ID
            const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            return subscriptionId;
        } catch (error) {
            throw new TransportError(
                `Failed to subscribe to topic ${topic}: ${error.message}`,
                this.transportType,
                { topic }
            );
        }
    }
    
    /**
     * Start consuming messages
     * @param {Function} messageHandler - Function to handle incoming messages
     * @returns {Promise<void>}
     */
    async startConsumer(messageHandler) {
        if (!this.connected || !this.consumer) {
            throw new TransportError(
                'Cannot start consumer: not connected to Kafka',
                this.transportType
            );
        }
        
        try {
            // Example with KafkaJS:
            // await this.consumer.run({
            //     eachMessage: async ({ topic, partition, message }) => {
            //         messageHandler(topic, message.value.toString());
            //     },
            // });
        } catch (error) {
            throw new TransportError(
                `Failed to start Kafka consumer: ${error.message}`,
                this.transportType
            );
        }
    }
    
    /**
     * Send a request and wait for a response (implement request-response pattern on Kafka)
     * @param {string} target - The target topic
     * @param {string} message - The message to send
     * @param {Object} options - Request options
     * @returns {Promise<any>} - The response
     */
    async request(target, message, options = {}) {
        if (!this.connected || !this.producer) {
            throw new TransportError(
                'Cannot send request: not connected to Kafka',
                this.transportType
            );
        }
        
        const correlationId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const replyTo = `${target}_replies`;
        const timeout = options.timeout || TIMEOUT_TASK_REQUEST;
        
        try {
            // Create a promise that will be resolved when the response is received
            const responsePromise = new Promise((resolve, reject) => {
                // Set a timeout
                const timeoutId = setTimeout(() => {
                    this.requestMap.delete(correlationId);
                    reject(new TimeoutError(`Request to ${target} timed out after ${timeout}ms`));
                }, timeout);
                
                // Store the resolver and timeout
                this.requestMap.set(correlationId, {
                    resolve,
                    reject,
                    timeoutId
                });
            });
            
            // Make sure we're subscribed to the reply topic
            // const replySubscription = await this.subscribe(replyTo);
            
            // Send the request with correlation ID and reply topic
            // await this.producer.send({
            //     topic: target,
            //     messages: [{
            //         value: message,
            //         headers: {
            //             'correlation-id': correlationId,
            //             'reply-to': replyTo
            //         }
            //     }]
            // });
            
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
                `Request to ${target} failed: ${error.message}`,
                this.transportType,
                { target }
            );
        }
    }
    
    /**
     * Process incoming response messages
     * @param {string} topic - The topic the message was received on
     * @param {Object} message - The message object
     */
    processResponseMessage(topic, message) {
        try {
            const headers = message.headers || {};
            const correlationId = headers['correlation-id'];
            
            if (correlationId && this.requestMap.has(correlationId)) {
                const { resolve, timeoutId } = this.requestMap.get(correlationId);
                clearTimeout(timeoutId);
                this.requestMap.delete(correlationId);
                resolve({ 
                    string: () => message.value.toString() 
                });
            }
        } catch (error) {
            logger.error('Error processing response message', { error, topic });
        }
    }
    
    /**
     * Set up discovery subscription
     * This is a template implementation that would need to be adapted for Kafka's message model
     */
    async setupDiscoverySubscription(discoveryTopic, namespace, agentName, discoveredAgents, acceptedNetworks) {
        try {
            // Subscribe to discovery topic
            await this.subscribe(discoveryTopic);
            logger.info(`Agent ${agentName} subscribed to discovery topic ${discoveryTopic}`);
            
            // Set up message handler for discovery messages
            const messageHandler = async (topic, message) => {
                if (topic !== discoveryTopic) return;
                
                try {
                    // Parse and validate the discovery message
                    let discoveryMessage;
                    try {
                        discoveryMessage = DiscoveryMessage.fromString(message);
                    } catch (parseError) {
                        logger.warn('Invalid discovery message format', { error: parseError.message });
                        return;
                    }
                    
                    // Process discovery message...
                    // The implementation would be similar to the NATS version but adapted for Kafka's async model
                } catch (error) {
                    logger.error('Error processing discovery message', { error });
                }
            };
            
            // Start listening for messages
            // You would need to integrate this with your Kafka consumer implementation
        } catch (error) {
            throw new DiscoveryError(
                `Failed to set up discovery subscription on topic ${discoveryTopic}`,
                { agentName, topic: discoveryTopic },
                error
            );
        }
    }
    
    /**
     * Set up task handler for processing incoming requests
     * @param {string} agentName - The agent name (used as the topic)
     * @param {Function} processingFunction - The function to process requests
     * @returns {Promise<void>}
     */
    async setupTaskHandler(agentName, processingFunction) {
        try {
            // Subscribe to agent's topic
            await this.subscribe(agentName);
            logger.info(`Agent ${agentName} subscribed for task handling`);
            
            // Set up message handler for task requests
            const messageHandler = async (topic, message, headers) => {
                if (topic !== agentName) return;
                
                try {
                    // Parse and validate the payload
                    const payload = JSON.parse(message);
                    if (!payload || typeof payload !== 'object') {
                        throw new Error('Invalid payload: not a JSON object');
                    }
                    
                    const replyTo = headers['reply-to'];
                    const correlationId = headers['correlation-id'];
                    
                    // Process the message using the Message class
                    const msg = new Message(payload);
                    
                    // Process the task with timeout
                    const response = await withTimeout(
                        async () => processingFunction(msg),
                        TIMEOUT_TASK_REQUEST * 2,
                        `task processing for ${agentName}`
                    );
                    
                    // Send response back if reply information is available
                    if (replyTo && correlationId) {
                        await this.publish(replyTo, response.serialize(), {
                            headers: { 'correlation-id': correlationId }
                        });
                    }
                } catch (error) {
                    logger.error("Error processing task", { error, agentName });
                    
                    // Send error response back if reply information is available
                    if (replyTo && correlationId) {
                        await this.publish(replyTo, JSON.stringify({
                            error: true,
                            message: error.message,
                            type: error.name || 'Error'
                        }), { 
                            headers: { 'correlation-id': correlationId } 
                        });
                    }
                }
            };
            
            // Start listening for messages
            // You would need to integrate this with your Kafka consumer implementation
        } catch (error) {
            throw new TransportError(
                `Failed to set up task handler for ${agentName}: ${error.message}`,
                this.transportType,
                { agentName }
            );
        }
    }
    
    /**
     * Creates a runtime for agent communication using Kafka
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
                    'Missing required Kafka configuration: discoveryTopic',
                    this.transportType,
                    { agentName }
                );
            }
            
            const discoveryTopic = config.bindings.discoveryTopic;
            const acceptedNetworks = config.bindings.acceptedNetworks || [];
            logger.info(`Agent ${agentName} initialized with discovery topic ${discoveryTopic}`);
            
            // Step 1: Subscribe to discovery topic
            await this.setupDiscoverySubscription(discoveryTopic, namespace, agentName, discoveredAgents, acceptedNetworks);
            
            // Step 2: Set up heartbeat
            this.setupHeartbeat(discoveryTopic, namespace, agentName, discoverySchemas, HEARTBEAT_INTERVAL);
            
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
                    `Failed to initialize Kafka runtime: ${error.message}`,
                    this.transportType,
                    { agentName }
                );
            }
            
            logger.error("Kafka runtime initialization failed", { error, agentName });
            throw error;
        }
    }
}

/**
 * Factory function to create a Kafka transport instance
 * @returns {KafkaTransport} - A Kafka transport instance
 */
export function createKafkaTransport() {
    return new KafkaTransport();
}

/**
 * Adapter function to create a Kafka-based runtime for agent communication
 * @param {string} namespace - The agent namespace
 * @param {string} agentName - The agent name
 * @param {Array} ioInterfaces - The IO interfaces (only the first one is used)
 * @param {Array} discoverySchemas - The agent capability schemas for discovery
 * @returns {Promise<Object>} - The runtime { handleTask, discoveredAgents }
 */
export async function KafkaIOAgentRuntime(namespace, agentName, ioInterfaces, discoverySchemas) {
    if (ioInterfaces.length > 1) {
        throw new TransportError(
            'Only one IO Kafka interface is supported',
            'Kafka',
            { agentName, interfacesCount: ioInterfaces.length }
        );
    }
    
    if (ioInterfaces.length === 0) {
        logger.warn(`No Kafka interfaces provided for agent ${agentName}, creating passive runtime`);
        return { handleTask: async () => {}, discoveredAgents: {} };
    }
    
    const io = ioInterfaces[0];
    const transport = createKafkaTransport();
    
    try {
        // Connect to Kafka with retry logic
        logger.info(`Connecting to Kafka for agent ${agentName}`);
        await safeConnect(transport, io.config);
        
        // Create runtime with the transport
        return await transport.createRuntime(namespace, agentName, discoverySchemas, io.config);
    } catch (error) {
        // Make sure to clean up if initialization fails
        await transport.disconnect();
        throw error;
    }
} 