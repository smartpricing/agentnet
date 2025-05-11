/**
 * NATS Runtime implementation for agent communication
 */
import { Message } from '../../index.js';
import { logger } from '../../utils/logger.js';
import { 
  TransportError, 
  DiscoveryError, 
  HandoffError, 
  TimeoutError,
  withTimeout,
  withRetry
} from '../../errors/index.js';

const HEARTBEAT_INTERVAL = 1000;
const TIMEOUT_TASK_REQUEST = 60000;
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * Class representing a discovery message for agent capabilities
 */
class DiscoveryMessage {
    /**
     * Create a new discovery message
     * @param {string} namespace - The agent namespace
     * @param {string} agentName - The agent name
     * @param {Array} schemas - The agent capability schemas
     */
    constructor(namespace, agentName, schemas) {
        if (!namespace) throw new Error('Namespace is required');
        if (!agentName) throw new Error('Agent name is required');
        if (!Array.isArray(schemas)) throw new Error('Schemas must be an array');
        
        this.type = 'discovery';
        this.network = `${namespace}.${agentName}`;
        this.agentName = agentName;
        this.schemas = schemas;
    }
    
    /**
     * Serialize the message to a JSON string
     * @returns {string} The serialized message
     */
    serialize() {
        return JSON.stringify({
            type: this.type,
            network: this.network,
            agentName: this.agentName,
            schemas: this.schemas
        });
    }
    
    /**
     * Create a DiscoveryMessage from a serialized string
     * @param {string} data - The serialized message data
     * @returns {DiscoveryMessage} A new DiscoveryMessage instance
     */
    static fromString(data) {
        const payload = JSON.parse(data);
        
        if (payload.type !== 'discovery') {
            throw new Error('Not a discovery message');
        }
        
        // Extract namespace from network (format: namespace.agentName)
        const networkParts = payload.network.split('.');
        if (networkParts.length !== 2) {
            throw new Error('Invalid network format in discovery message');
        }
        
        const namespace = networkParts[0];
        return new DiscoveryMessage(namespace, payload.agentName, payload.schemas);
    }
    
    /**
     * Validate if a payload conforms to discovery message structure
     * @param {Object} payload - The payload to validate
     * @returns {boolean} Whether the payload is valid
     */
    static isValid(payload) {
        return (
            payload &&
            typeof payload === 'object' &&
            payload.type === 'discovery' &&
            typeof payload.network === 'string' &&
            typeof payload.agentName === 'string' &&
            Array.isArray(payload.schemas)
        );
    }
}

/**
 * Sets up discovery subscription to find other agents
 */
async function setupDiscoverySubscription(nc, discoveryTopic, namespace, agentName, discoveredAgents, acceptedNetworks) {
    let discoverySub;
    
    try {
        discoverySub = nc.subscribe(discoveryTopic);
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
            let nonAcceptedNetworks = {}
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
                                                const response = await withRetry(
                                                    async () => {
                                                        const message = new Message({ 
                                                            session: state,
                                                            content: input
                                                        })
                                                        const req = await nc.request(
                                                            discoveryMessage.agentName, 
                                                            message.serialize(), 
                                                            { timeout: TIMEOUT_TASK_REQUEST }
                                                        );
                                                        return req.string();
                                                    },
                                                    {
                                                        maxRetries: 2,
                                                        onRetry: ({ attempt }) => {
                                                            logger.warn(`Retrying handoff attempt ${attempt} to ${discoveryMessage.agentName}`, {
                                                                schema: schema.name
                                                            });
                                                        }
                                                    }
                                                );
                                                return response;
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
            if (nc.isConnected()) {
                logger.info('Attempting to resubscribe to discovery topic');
                try {
                    discoverySub = nc.subscribe(discoveryTopic);
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
 * Sets up a heartbeat to announce this agent's capabilities
 */
function setupDiscoveryHeartbeat(nc, discoveryTopic, namespace, agentName, discoverySchemas) {
    let consecutiveErrors = 0;
    
    return setInterval(async () => {
        try {
            const discoveryMessage = new DiscoveryMessage(namespace, agentName, discoverySchemas);
            await nc.publish(discoveryTopic, discoveryMessage.serialize());
            
            // Reset error counter on success
            if (consecutiveErrors > 0) {
                logger.info(`Discovery heartbeat resumed for ${agentName}`);
                consecutiveErrors = 0;
            }
        } catch (error) {
            consecutiveErrors++;
            
            // Log with increasing severity based on consecutive failures
            if (consecutiveErrors > 5) {
                logger.error(`Failed to publish discovery heartbeat (${consecutiveErrors} consecutive failures)`, {
                    error,
                    agentName,
                    topic: discoveryTopic
                });
            } else {
                logger.warn(`Error publishing discovery heartbeat (attempt ${consecutiveErrors})`, {
                    error: error.message,
                    agentName
                });
            }
        }
    }, HEARTBEAT_INTERVAL);
}

/**
 * Creates a task handler for incoming requests
 */
async function createTaskHandler(nc, agentName, processingFunction) {
    let taskSub;
    
    try {
        taskSub = nc.subscribe(agentName, { queue: agentName });
        logger.info(`Agent ${agentName} subscribed for task handling`);
    } catch (error) {
        throw new TransportError(
            `Failed to subscribe for task handling: ${error.message}`,
            'NATS',
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

                const message = new Message(payload)
                const input = message.getContent()
                const session = message.getSession()

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
                    inputPreview: payload && input 
                        ? (typeof input === 'string' 
                            ? input.substring(0, 100) 
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
        if (nc.isConnected()) {
            logger.info('Attempting to resubscribe for task handling');
            try {
                const newTaskSub = nc.subscribe(agentName, { queue: agentName });
                // Start a new processing loop
                createTaskHandler(nc, agentName, processingFunction);
            } catch (resubError) {
                logger.error('Failed to resubscribe for task handling', { error: resubError });
                throw new TransportError(
                    "Failed to resubscribe for task handling",
                    'NATS',
                    { agentName, originalError: error.message, resubError: resubError.message }
                );
            }
        } else {
            throw new TransportError(
                "NATS connection lost during task handling",
                'NATS',
                { agentName }
            );
        }
    }
}

/**
 * Safely connects to NATS with retry logic
 */
async function safeConnect(instance, options = {}) {
    const { maxRetries = MAX_RECONNECT_ATTEMPTS } = options;
    
    return withRetry(
        async () => {
            try {
                return await instance.connect();
            } catch (error) {
                throw new TransportError(
                    `Failed to connect to NATS: ${error.message}`,
                    'NATS',
                    { details: error.message }
                );
            }
        },
        {
            maxRetries,
            baseDelayMs: 500,
            onRetry: ({ attempt }) => {
                logger.warn(`NATS connect attempt ${attempt}/${maxRetries} failed, retrying...`);
            }
        }
    );
}

/**
 * Creates a NATS-based runtime for agent communication
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
        return { handleTask: async () => {}, discoveredAgents: [] };
    }
    
    const io = ioInterfaces[0];
    const intervals = [];
    const discoveredAgents = {};
    
    try {
        // Connect to NATS with retry logic
        logger.info(`Connecting to NATS for agent ${agentName}`);
        const nc = await safeConnect(io.instance);
        
        // Verify configuration
        if (!io.config || !io.config.bindings || !io.config.bindings.discoveryTopic) {
            throw new TransportError(
                'Missing required NATS configuration: discoveryTopic',
                'NATS',
                { agentName }
            );
        }
        
        const discoveryTopic = io.config.bindings.discoveryTopic;
        const acceptedNetworks = io.config.bindings.acceptedNetworks || [];
        logger.info(`Agent ${agentName} initialized with discovery topic ${discoveryTopic}`);

        // Step 1. Subscribe to discovery topic
        await setupDiscoverySubscription(nc, discoveryTopic, namespace, agentName, discoveredAgents, acceptedNetworks);

        // Step 2. Publish discovery heartbeat
        const interval = setupDiscoveryHeartbeat(nc, discoveryTopic, namespace, agentName, discoverySchemas);
        intervals.push(interval);

        // Step 3. Create task handler
        const handleTask = async (fn) => {
            if (typeof fn !== 'function') {
                throw new Error('Task handler must be a function');
            }
            await createTaskHandler(nc, agentName, fn);
        };

        return { handleTask, discoveredAgents };
    } catch (error) {
        // Clean up intervals if connection fails
        intervals.forEach(clearInterval);
        
        // Enhance the error with context if it's not already a TransportError
        if (!(error instanceof TransportError)) {
            error = new TransportError(
                `Failed to initialize NATS runtime: ${error.message}`,
                'NATS',
                { agentName }
            );
        }
        
        logger.error("NATS runtime initialization failed", { error, agentName });
        throw error;
    }
}
