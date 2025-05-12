/**
 * Base Transport Interface
 * Defines common functionality across different transport implementations (NATS, Kafka, RabbitMQ, Redis, etc.)
 */
import { TransportError } from '../errors/index.js';
import { logger } from '../utils/logger.js';

/**
 * Base TransportMessage class that can be extended by specific transport implementations
 */
export class TransportMessage {
    constructor(type, payload) {
        this.type = type;
        this.payload = payload;
    }
    
    serialize() {
        return JSON.stringify({
            type: this.type,
            payload: this.payload
        });
    }
    
    static fromString(data) {
        try {
            const parsed = JSON.parse(data);
            return new TransportMessage(parsed.type, parsed.payload);
        } catch (error) {
            throw new Error(`Failed to parse message: ${error.message}`);
        }
    }
}

/**
 * Discovery Message format for agent discovery
 */
export class DiscoveryMessage extends TransportMessage {
    constructor(namespace, agentName, schemas) {
        if (!namespace) throw new Error('Namespace is required');
        if (!agentName) throw new Error('Agent name is required');
        if (!Array.isArray(schemas)) throw new Error('Schemas must be an array');
        
        const payload = {
            network: `${namespace}.${agentName}`,
            agentName: agentName,
            schemas: schemas
        };
        
        super('discovery', payload);
    }
    
    get network() {
        return this.payload.network;
    }
    
    get agentName() {
        return this.payload.agentName;
    }
    
    get schemas() {
        return this.payload.schemas;
    }
    
    static fromString(data) {
        const message = TransportMessage.fromString(data);
        
        if (message.type !== 'discovery') {
            throw new Error('Not a discovery message');
        }
        
        // Extract namespace from network (format: namespace.agentName)
        const networkParts = message.payload.network.split('.');
        if (networkParts.length !== 2) {
            throw new Error('Invalid network format in discovery message');
        }
        
        const namespace = networkParts[0];
        return new DiscoveryMessage(
            namespace, 
            message.payload.agentName, 
            message.payload.schemas
        );
    }
    
    static isValid(payload) {
        return (
            payload &&
            typeof payload === 'object' &&
            payload.type === 'discovery' &&
            typeof payload.payload.network === 'string' &&
            typeof payload.payload.agentName === 'string' &&
            Array.isArray(payload.payload.schemas)
        );
    }
}

/**
 * Base Transport Interface - all transport implementations should implement this interface
 */
export class Transport {
    /**
     * Create a new transport instance
     * @param {string} transportType - The type of transport (e.g., 'NATS', 'Kafka')
     */
    constructor(transportType) {
        this.transportType = transportType;
        this.connected = false;
        this.intervals = [];
    }
    
    /**
     * Connect to the transport
     * @param {Object} config - Configuration options
     * @returns {Promise<any>} - The connection instance
     */
    async connect(config) {
        throw new Error('Method connect() must be implemented by subclass');
    }
    
    /**
     * Disconnect from the transport
     * @returns {Promise<void>}
     */
    async disconnect() {
        // Clean up intervals
        this.intervals.forEach(clearInterval);
        this.intervals = [];
        
        this.connected = false;
    }
    
    /**
     * Publish a message to a topic/channel
     * @param {string} topic - The topic/channel to publish to
     * @param {string|Buffer|Object} message - The message to publish
     * @returns {Promise<void>}
     */
    async publish(topic, message) {
        throw new Error('Method publish() must be implemented by subclass');
    }
    
    /**
     * Subscribe to a topic/channel
     * @param {string} topic - The topic/channel to subscribe to
     * @param {Object} options - Subscription options
     * @returns {Promise<any>} - The subscription instance
     */
    async subscribe(topic, options = {}) {
        throw new Error('Method subscribe() must be implemented by subclass');
    }
    
    /**
     * Send a request and wait for a response
     * @param {string} target - The target to send the request to
     * @param {string|Buffer|Object} message - The message to send
     * @param {Object} options - Request options
     * @returns {Promise<any>} - The response
     */
    async request(target, message, options = {}) {
        throw new Error('Method request() must be implemented by subclass');
    }
    
    /**
     * Set up heartbeat to announce agent capabilities
     * @param {string} topic - The topic to publish heartbeats to
     * @param {string} namespace - The agent namespace
     * @param {string} agentName - The agent name
     * @param {Array} schemas - The agent capability schemas
     * @param {number} interval - The heartbeat interval in milliseconds
     * @returns {number} - The interval ID
     */
    setupHeartbeat(topic, namespace, agentName, schemas, interval = 1000) {
        const heartbeatInterval = setInterval(async () => {
            try {
                const discoveryMessage = new DiscoveryMessage(namespace, agentName, schemas);
                await this.publish(topic, discoveryMessage.serialize());
            } catch (error) {
                logger.error(`Failed to publish heartbeat for ${agentName}`, {
                    error,
                    transportType: this.transportType
                });
            }
        }, interval);
        
        this.intervals.push(heartbeatInterval);
        return heartbeatInterval;
    }
    
    /**
     * Creates a runtime for agent communication
     * @param {string} namespace - The agent namespace
     * @param {string} agentName - The agent name
     * @param {Array} discoverySchemas - The agent capability schemas for discovery
     * @param {Object} config - Additional configuration
     * @returns {Promise<Object>} - The runtime { handleTask, discoveredAgents }
     */
    async createRuntime(namespace, agentName, discoverySchemas, config = {}) {
        throw new Error('Method createRuntime() must be implemented by subclass');
    }
}

/**
 * Safely connect to a transport with retry logic
 * @param {Transport} transport - The transport instance
 * @param {Object} config - Connection configuration
 * @param {Object} options - Retry options
 * @returns {Promise<any>} - The connection instance
 */
export async function safeConnect(transport, config, options = {}) {
    const { maxRetries = 5 } = options;
    
    let attempt = 0;
    let lastError = null;
    
    while (attempt < maxRetries) {
        try {
            attempt++;
            return await transport.connect(config);
        } catch (error) {
            lastError = error;
            logger.warn(`Transport connect attempt ${attempt}/${maxRetries} failed, retrying...`, {
                transportType: transport.transportType,
                error: error.message
            });
            
            // Exponential backoff
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw new TransportError(
        `Failed to connect after ${maxRetries} attempts: ${lastError?.message}`,
        transport.transportType,
        { details: lastError?.message }
    );
} 