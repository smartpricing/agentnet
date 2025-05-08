import { AgentRuntime } from "./runtime.js"

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
     * Validates that required configuration is present
     * @throws {Error} If configuration is invalid
     */
    function validateConfiguration() {
        if (!config.metadata.name) {
            throw new Error("Agent must have a name");
        }
        
        if (Object.keys(config.llm).length === 0) {
            throw new Error("Agent must have an LLM configuration");
        }
        
        if (!config.llm.api) {
            throw new Error("Agent must have an LLM API");
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
            throw new Error("IO instance must have a type");
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
            throw new Error("LLM API is required");
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
            throw new Error(`Event handler for ${eventName} must be a function`);
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
            throw new Error("Discovery schema is required");
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
            throw new Error("Tool schema must have a name");
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
            throw new Error("Metadata is required");
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
            const runtime = await AgentRuntime(config);
            
            return {
                query: async (input) => {
                    try {
                        const state = {};
                        const conversation = [];
                        const formattedInput = typeof input === 'string' ? input : JSON.stringify(input);
                        
                        // Process input through prompt hook
                        const promptContent = await config.on.prompt(state, formattedInput);
                        
                        // Execute agent runtime
                        const result = await runtime(state, conversation, promptContent);
                        
                        // Process result through response hook
                        return await config.on.response(state, conversation, result);
                    } catch (error) {
                        console.error("Agent query execution error:", error);
                        throw error;
                    }
                }
            };
        } catch (error) {
            console.error("Agent compilation error:", error);
            throw error;
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