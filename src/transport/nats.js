/**
 * NATS Transport implementation
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
 * NATS implementation of the Transport interface
 */
export class NatsTransport extends Transport {
    constructor() {
        super('NATS');
        this.connection = null;
    }
    
    /**
     * Connect to NATS
     * @param {Object} config - NATS connection configuration
     * @returns {Promise<any>} - The NATS connection instance
     */
    async connect(config) {
        if (this.connected && this.connection) {
            return this.connection;
        }
        
        try {
            this.connection = await config.instance.connect();
            this.connected = true;
            return this.connection;
        } catch (error) {
            throw new TransportError(
                `Failed to connect to NATS: ${error.message}`,
                this.transportType,
                { details: error.message }
            );
        }
    }
    
    /**
     * Disconnect from NATS
     * @returns {Promise<void>}
     */
    async disconnect() {
        await super.disconnect();
        
        if (this.connection) {
            try {
                await this.connection.drain();
                this.connection = null;
            } catch (error) {
                logger.warn('Error disconnecting from NATS', { error });
            }
        }
    }
    
    /**
     * Publish a message to a NATS topic
     * @param {string} topic - The topic to publish to
     * @param {string} message - The message to publish
     * @returns {Promise<void>}
     */
    async publish(topic, message) {
        if (!this.connected || !this.connection) {
            throw new TransportError(
                'Cannot publish: not connected to NATS',
                this.transportType
            );
        }
        
        try {
            await this.connection.publish(topic, message);
        } catch (error) {
            throw new TransportError(
                `Failed to publish to topic ${topic}: ${error.message}`,
                this.transportType,
                { topic }
            );
        }
    }
    
    /**
     * Subscribe to a NATS topic
     * @param {string} topic - The topic to subscribe to
     * @param {Object} options - Subscription options
     * @returns {Promise<any>} - The subscription instance
     */
    async subscribe(topic, options = {}) {
        if (!this.connected || !this.connection) {
            throw new TransportError(
                'Cannot subscribe: not connected to NATS',
                this.transportType
            );
        }
        
        try {
            return this.connection.subscribe(topic, options);
        } catch (error) {
            throw new TransportError(
                `Failed to subscribe to topic ${topic}: ${error.message}`,
                this.transportType,
                { topic }
            );
        }
    }
    
    /**
     * Send a request and wait for a response
     * @param {string} target - The target to send the request to
     * @param {string} message - The message to send
     * @param {Object} options - Request options
     * @returns {Promise<any>} - The response
     */
    async request(target, message, options = {}) {
        if (!this.connected || !this.connection) {
            throw new TransportError(
                'Cannot send request: not connected to NATS',
                this.transportType
            );
        }
        
        try {
            return await this.connection.request(target, message, options);
        } catch (error) {
            throw new TransportError(
                `Request to ${target} failed: ${error.message}`,
                this.transportType,
                { target }
            );
        }
    }
    
    /**
     * Set up discovery subscription
     * @param {string} discoveryTopic - The topic for discovery messages
     * @param {string} namespace - The agent namespace
     * @param {string} agentName - The agent name
     * @param {Object} discoveredAgents - Map to store discovered agents
     * @param {Array} acceptedNetworks - List of accepted networks
     * @returns {Promise<void>}
     */
    async setupDiscoverySubscription(discoveryTopic, namespace, agentName, discoveredAgents, acceptedNetworks) {
        let discoverySub;
        
        try {
            discoverySub = await this.subscribe(discoveryTopic);
            logger.info(`Agent ${agentName} subscribed to discovery topic ${discoveryTopic}`);
        } catch (error) {
            throw new DiscoveryError(
                `Failed to subscribe to discovery topic ${discoveryTopic}`,
                { agentName, topic: discoveryTopic },
                error
            );
        }
        
        const handleDiscovery = async () => {
            try {
                let nonAcceptedNetworks = {};
                for await (const m of discoverySub) {
                    try {
                        // Attempt to parse and validate the discovery message
                        let discoveryMessage;
                        try {
                            discoveryMessage = DiscoveryMessage.fromString(m.string());
                        } catch (parseError) {
                            logger.warn('Invalid discovery message format', { error: parseError.message });
                            continue;
                        }

                        const network = discoveryMessage.network;
                        const networkNamespace = network.split(".")[0];
                        const networkName = network.split(".")[1];

                        // Skip self
                        if (network === `${namespace}.${agentName}`) {
                            continue;
                        }

                        // Skip if already processed
                        if (nonAcceptedNetworks[network] === true) {
                            continue;
                        }

                        let isAccepted = false;
                        for (const acceptedNetwork of acceptedNetworks) {
                            const acceptedNetworkNamespace = acceptedNetwork.split(".")[0];
                            const acceptedNetworkName = acceptedNetwork.split(".")[1];

                            if (acceptedNetworkNamespace === networkNamespace && acceptedNetworkName === networkName) {
                                isAccepted = true;
                                continue;
                            }
                            // Check for wildcard patterns in accepted networks
                            
                            if (acceptedNetworkNamespace === '*' && acceptedNetworkName === '*') {
                                // Both namespace and name are wildcards, accept any network
                                logger.debug(`Agent ${agentName} accepting network ${network} due to wildcard pattern *.*`);
                                isAccepted = true;
                                continue;
                            }
                            
                            if (acceptedNetworkNamespace === '*' && acceptedNetworkName === networkName) {
                                // Namespace is wildcard, but name matches
                                logger.debug(`Agent ${agentName} accepting network ${network} due to wildcard pattern *.${networkName}`);
                                isAccepted = true;
                                continue;
                            }
                            
                            if (acceptedNetworkNamespace === networkNamespace && acceptedNetworkName === '*') {
                                // Name is wildcard, but namespace matches
                                logger.debug(`Agent ${agentName} accepting network ${network} due to wildcard pattern ${networkNamespace}.*`);
                                isAccepted = true;
                                continue;
                            }
                        }
                        

                        // Skip if not accepted
                        if (!isAccepted) {
                            logger.warn(`Agent ${agentName} does not accept network ${network}`);
                            nonAcceptedNetworks[network] = true;
                            continue;
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
                }
            } catch (error) {
                logger.error("Discovery subscription error", { error });
                
                // Attempt to resubscribe if the connection is still active
                if (this.connected) {
                    logger.info('Attempting to resubscribe to discovery topic');
                    try {
                        discoverySub = await this.subscribe(discoveryTopic);
                        handleDiscovery(); // Restart the handling process
                    } catch (resubError) {
                        logger.error('Failed to resubscribe to discovery topic', { error: resubError });
                    }
                }
            }
        };
        
        // Start processing discovery messages
        handleDiscovery();
    }
    
    /**
     * Set up task handler for processing incoming requests
     * @param {string} agentName - The agent name
     * @param {Function} processingFunction - The function to process requests
     * @returns {Promise<void>}
     */
    async setupTaskHandler(agentName, processingFunction) {
        let taskSub;
        
        try {
            taskSub = await this.subscribe(agentName, { queue: agentName });
            logger.info(`Agent ${agentName} subscribed for task handling`);
        } catch (error) {
            throw new TransportError(
                `Failed to subscribe for task handling: ${error.message}`,
                this.transportType,
                { agentName }
            );
        }
        
        try {
            for await (const m of taskSub) {
                let payload;
                
                try {
                    // Parse and validate the payload
                    payload = m.json();
                    if (!payload || typeof payload !== 'object') {
                        throw new Error('Invalid payload: not a JSON object');
                    }

                    const message = new Message(payload);
                    const input = message.getContent();
                    const session = message.getSession();

                    logger.debug(`Received task request for ${agentName}`, {
                        inputPreview: typeof input === 'string' 
                            ? input.substring(0, 100) 
                            : 'Non-string input'
                    });
                    
                    // Process the task with timeout
                    const response = await withTimeout(
                        async () => processingFunction(message),
                        TIMEOUT_TASK_REQUEST * 2, // Double the timeout for processing
                        `task processing for ${agentName}`
                    );
                    
                    // Respond with the result
                    await m.respond(response.serialize());
                    
                    logger.debug(`Completed task request for ${agentName}`);
                } catch (error) {
                    logger.error("Error processing task", {
                        error,
                        agentName,
                        inputPreview: payload && payload.content 
                            ? (typeof payload.content === 'string' 
                                ? payload.content.substring(0, 100) 
                                : 'Non-string input')
                            : 'No input' 
                    });
                    
                    // Send error response back
                    try {
                        await m.respond(JSON.stringify({
                            error: true,
                            message: error.message,
                            type: error.name || 'Error'
                        }));
                    } catch (respondError) {
                        logger.error("Failed to send error response", { error: respondError });
                    }
                }
            }
        } catch (error) {
            logger.error("Task subscription error", { error, agentName });
            
            // Attempt to resubscribe if the connection is still active
            if (this.connected) {
                logger.info('Attempting to resubscribe for task handling');
                try {
                    await this.setupTaskHandler(agentName, processingFunction);
                } catch (resubError) {
                    logger.error('Failed to resubscribe for task handling', { error: resubError });
                    throw new TransportError(
                        "Failed to resubscribe for task handling",
                        this.transportType,
                        { agentName, originalError: error.message, resubError: resubError.message }
                    );
                }
            } else {
                throw new TransportError(
                    "NATS connection lost during task handling",
                    this.transportType,
                    { agentName }
                );
            }
        }
    }
    
    /**
     * Creates a runtime for agent communication using NATS
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
                    'Missing required NATS configuration: discoveryTopic',
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
                    `Failed to initialize NATS runtime: ${error.message}`,
                    this.transportType,
                    { agentName }
                );
            }
            
            logger.error("NATS runtime initialization failed", { error, agentName });
            throw error;
        }
    }
}

/**
 * Factory function to create a NATS transport instance
 * @param {Object} config - Configuration for the NATS transport
 * @returns {NatsTransport} - A configured NATS transport instance
 */
export function createNatsTransport() {
    return new NatsTransport();
}

/**
 * Adapter function to create a NATS-based runtime for agent communication
 * Maintains compatibility with the original NatsIOAgentRuntime function
 * @param {string} namespace - The agent namespace
 * @param {string} agentName - The agent name
 * @param {Array} ioInterfaces - The IO interfaces (only the first one is used)
 * @param {Array} discoverySchemas - The agent capability schemas for discovery
 * @returns {Promise<Object>} - The runtime { handleTask, discoveredAgents }
 */
export async function NatsIOAgentRuntime(namespace, agentName, ioInterfaces, discoverySchemas) {
    if (ioInterfaces.length > 1) {
        throw new TransportError(
            'Only one IO Nats interface is supported',
            'NATS',
            { agentName, interfacesCount: ioInterfaces.length }
        );
    }
    
    if (ioInterfaces.length === 0) {
        logger.warn(`No NATS interfaces provided for agent ${agentName}, creating passive runtime`);
        return { handleTask: async () => {}, discoveredAgents: {} };
    }
    
    const io = ioInterfaces[0];
    const transport = createNatsTransport();
    
    try {
        // Connect to NATS with retry logic
        logger.info(`Connecting to NATS for agent ${agentName}`);
        await safeConnect(transport, { instance: io.instance });
        
        // Create runtime with the transport
        return await transport.createRuntime(namespace, agentName, discoverySchemas, io.config);
    } catch (error) {
        // Make sure to clean up if initialization fails
        await transport.disconnect();
        throw error;
    }
} 