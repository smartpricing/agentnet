import { AgentRuntime } from "./runtime.js"

export function Agent () {
    const _config = {
        metadata: {
            name: "default",
            description: "A default agent"
        },
        llm: {},
        io: [],
        handoffs: [],
        discoverySchemas: [],
        hooks: null,
        toolsAndHandoffsMap: { 
            tools: []
        },
        toolsSchemas: {},
        runner: { 
            maxRuns: 10
        },
        on: {
            prompt: async (state, formattedInput) => { return formattedInput },
            response: async (state, conversation, result) => { return result }
        }
    }

    function addIO (instance, config) {
        _config.io.push({
            type: instance.type,
            instance: instance,
            config: config
        })
        return this
    }
    
    function withLLM (llmApi, llmConfig) {
        _config.llm = {
            api: llmApi,
            config: llmConfig
        }
        return this 
    }
    
    function on (key, fn) {
        _config.on[key] = fn
        return this
    }
    
    function addDiscoverySchema (schema) {
        _config.discoverySchemas.push(schema)
        return this
    }

    function addToolSchema (schema) {
        _config.toolsSchemas[schema.name] = schema
        return this
    }

    function setMetadata (metadata) {
        _config.metadata = metadata
        return this
    }

    function getToolsSchemas () {
        return _config.toolsSchemas
    }
    
    async function compile () {
        const runtime = await AgentRuntime(_config)
    
        return {
            query: async (input) => {
                const state = {}
                const conversation = []
                const formattedInput = typeof input == 'string' ? input : JSON.stringify(input)
                
                const promptContent = await _config.on.prompt(state, formattedInput);
                const result = await runtime(state, conversation, promptContent)
                const response = await _config.on.response(state, conversation, result);
                return response;
            },
        };
    }       

    const agentInterface = {
        _config,
        addIO,
        withLLM,
        on,
        addDiscoverySchema,
        addToolSchema,
        compile,
        setMetadata,
        getToolsSchemas
    }

    return agentInterface
}