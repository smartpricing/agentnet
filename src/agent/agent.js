import { AgentRuntime } from "./runtime.js"
import { 
    validateRequired, 
    validateType, 
    validateObject, 
    validateEnum
} from "../utils/validation.js"
import { CompilationError, ConfigurationError } from "../errors/index.js"
import { logger } from "../utils/logger.js"

/**
 * Default hooks for agent events
 */
const DEFAULT_HOOKS = {
    prompt: async (state, formattedInput) => formattedInput,
    response: async (state, conversation, result) => result
}

/**
 * Default agent configuration
 */
const DEFAULT_CONFIG = {
    metadata: {
        name: "default",
        description: "A default agent"
    },
    runner: { 
        maxRuns: 10
    }
}

/**
 * Schema for agent configuration validation
 */
const AGENT_CONFIG_SCHEMA = {
    type: 'object',
    properties: {
        metadata: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                description: { type: 'string' }
            },
            required: ['name']
        },
        llm: {
            type: 'object',
            properties: {
                api: { type: 'object' },
                config: { type: 'object' }
            },
            required: ['api']
        },
        io: { type: 'array' },
        handoffs: { type: 'array' },
        discoverySchemas: { type: 'array' },
        toolsAndHandoffsMap: { 
            type: 'object',
            properties: {
                tools: { type: 'array' }
            }
        },
        toolsSchemas: { type: 'object' },
        runner: {
            type: 'object',
            properties: {
                maxRuns: { type: 'number' }
            }
        },
        on: { type: 'object' }
    },
    required: ['metadata', 'llm']
}

/**
 * Creates a new Agent builder
 * @returns {Object} Agent builder interface
 */
export function Agent() {
    // Initialize agent configuration
    const config = {
        metadata: { ...DEFAULT_CONFIG.metadata },
        llm: {},
        io: [],
        handoffs: [],
        discoverySchemas: [],
        hooks: null,
        toolsAndHandoffsMap: { 
            tools: []
        },
        toolsSchemas: {},
        runner: { ...DEFAULT_CONFIG.runner },
        on: { ...DEFAULT_HOOKS }
    }

    /**
     * Validates that required configuration is present and well-formed
     * @throws {ConfigurationError} If configuration is invalid
     */
    function validateConfiguration() {
        try {
            // Validate overall structure against schema
            validateObject(config, AGENT_CONFIG_SCHEMA, 'agent_config');
            
            // Additional specific validations
            
            // Metadata validation
            if (!config.metadata.name.trim()) {
                throw new ConfigurationError("Agent name cannot be empty", { 
                    metadata: config.metadata 
                });
            }
            
            // LLM API validation
            if (typeof config.llm.api !== 'object' || config.llm.api === null) {
                throw new ConfigurationError("LLM API must be a valid object", { 
                    api: config.llm.api 
                });
            }
            
            if (!config.llm.api.getClient || typeof config.llm.api.getClient !== 'function') {
                throw new ConfigurationError("LLM API must have a getClient method", { 
                    apiMethods: Object.keys(config.llm.api)
                });
            }
            
            if (!config.llm.api.callModel || typeof config.llm.api.callModel !== 'function') {
                throw new ConfigurationError("LLM API must have a callModel method", { 
                    apiMethods: Object.keys(config.llm.api)
                });
            }
            
            // IO validation
            if (config.io.length > 0) {
                config.io.forEach((io, index) => {
                    if (!io.type) {
                        throw new ConfigurationError(`IO interface at index ${index} has no type`, { 
                            io 
                        });
                    }
                    
                    if (!io.instance) {
                        throw new ConfigurationError(`IO interface ${io.type} at index ${index} has no instance`, { 
                            io 
                        });
                    }
                    
                    if (!io.config) {
                        throw new ConfigurationError(`IO interface ${io.type} at index ${index} has no configuration`, { 
                            io 
                        });
                    }
                });
            }
            
            // Tool schemas validation
            const toolSchemas = Object.values(config.toolsSchemas);
            toolSchemas.forEach(schema => {
                if (!schema.name) {
                    throw new ConfigurationError("Tool schema must have a name", { 
                        schema 
                    });
                }
            });
            
            // Event handlers validation
            Object.entries(config.on).forEach(([eventName, handler]) => {
                if (typeof handler !== 'function') {
                    throw new ConfigurationError(`Event handler for '${eventName}' must be a function`, { 
                        eventName, 
                        handlerType: typeof handler 
                    });
                }
            });
            
            // Runner validation
            validateType(config.runner.maxRuns, 'number', 'runner.maxRuns', 'agent_config');
            if (config.runner.maxRuns <= 0) {
                throw new ConfigurationError("runner.maxRuns must be greater than 0", { 
                    maxRuns: config.runner.maxRuns 
                });
            }
            
            logger.debug(`Agent ${config.metadata.name} configuration validated successfully`);
            
        } catch (error) {
            if (error instanceof ConfigurationError) {
                logger.error(`Agent configuration validation failed: ${error.message}`, {
                    configContext: error.configContext,
                    agentName: config.metadata?.name || 'unknown'
                });
                throw error;
            }
            
            // Wrap other errors
            logger.error(`Agent configuration validation failed with unexpected error`, {
                error,
                agentName: config.metadata?.name || 'unknown'
            });
            
            throw new ConfigurationError(
                `Agent configuration validation failed: ${error.message}`,
                { cause: error }
            );
        }
    }
    
    /**
     * Adds an IO interface to the agent
     * @param {Object} instance - IO provider instance
     * @param {Object} ioConfig - IO configuration
     * @returns {Object} Agent builder for chaining
     */
    function addIO(instance, ioConfig) {
        if (!instance || !instance.type) {
            throw new ConfigurationError("IO instance must have a type", {
                instance: instance ? Object.keys(instance) : null
            });
        }
        
        config.io.push({
            type: instance.type,
            instance: instance,
            config: ioConfig || {}
        });
        
        return this;
    }
    
    /**
     * Configures the LLM for the agent
     * @param {Object} llmApi - LLM API provider
     * @param {Object} llmConfig - LLM configuration
     * @returns {Object} Agent builder for chaining
     */
    function withLLM(llmApi, llmConfig) {
        if (!llmApi) {
            throw new ConfigurationError("LLM API is required", {
                provided: llmApi
            });
        }
        
        config.llm = {
            api: llmApi,
            config: llmConfig || {}
        };
        
        return this;
    }
    
    /**
     * Registers an event handler
     * @param {String} eventName - Event name
     * @param {Function} handler - Event handler function
     * @returns {Object} Agent builder for chaining
     */
    function on(eventName, handler) {
        if (typeof handler !== 'function') {
            throw new ConfigurationError(`Event handler for ${eventName} must be a function`, {
                provided: typeof handler
            });
        }
        
        config.on[eventName] = handler;
        return this;
    }
    
    /**
     * Adds a discovery schema
     * @param {Object} schema - Discovery schema
     * @returns {Object} Agent builder for chaining
     */
    function addDiscoverySchema(schema) {
        if (!schema) {
            throw new ConfigurationError("Discovery schema is required", {
                provided: schema
            });
        }
        
        config.discoverySchemas.push(schema);
        return this;
    }

    /**
     * Adds a tool schema
     * @param {Object} schema - Tool schema
     * @returns {Object} Agent builder for chaining
     */
    function addToolSchema(schema) {
        if (!schema || !schema.name) {
            throw new ConfigurationError("Tool schema must have a name", {
                schema: schema
            });
        }
        
        config.toolsSchemas[schema.name] = schema;
        return this;
    }

    /**
     * Sets agent metadata
     * @param {Object} metadata - Agent metadata
     * @returns {Object} Agent builder for chaining
     */
    function setMetadata(metadata) {
        if (!metadata) {
            throw new ConfigurationError("Metadata is required", {
                provided: metadata
            });
        }
        
        config.metadata = {
            ...config.metadata,
            ...metadata
        };
        
        return this;
    }

    /**
     * Gets all registered tool schemas
     * @returns {Object} Map of tool schemas
     */
    function getToolsSchemas() {
        return { ...config.toolsSchemas };
    }
    
    /**
     * Compiles the agent configuration into a runnable agent
     * @returns {Promise<Object>} Compiled agent interface
     */
    async function compile() {
        // Validate configuration before compiling
        validateConfiguration();
        
        try {
            logger.info(`Compiling agent ${config.metadata.name}`);
            const runtime = await AgentRuntime(config);

            const queryFunction = async (input) => {
                try {
                    const state = {};
                    const conversation = [];
                    const formattedInput = typeof input === 'string' ? input : JSON.stringify(input);
                    
                    logger.debug(`Query to agent ${config.metadata.name}`, {
                        inputPreview: formattedInput.substring(0, 100)
                    });
                    
                    // Process input through prompt hook
                    const promptContent = await config.on.prompt(state, formattedInput);
                    
                    // Execute agent runtime
                    const result = await runtime(state, conversation, promptContent);
                    
                    // Process result through response hook
                    return await config.on.response(state, conversation, result);
                } catch (error) {
                    logger.error(`Agent query execution error: ${error.message}`, {
                        agentName: config.metadata.name,
                        error
                    });
                    throw error;
                }
            }
            
            return {
                query: queryFunction
            };
        } catch (error) {
            logger.error(`Agent compilation error: ${error.message}`, {
                agentName: config.metadata.name,
                error
            });
            
            throw new CompilationError(
                `Failed to compile agent ${config.metadata.name}: ${error.message}`,
                config.metadata.name,
                error
            );
        }
    }

    // Return the agent builder interface
    return {
        addIO,
        withLLM,
        on,
        addDiscoverySchema,
        addToolSchema,
        compile,
        setMetadata,
        getToolsSchemas,
        
        // Expose config for backward compatibility
        _config: config
    };
}