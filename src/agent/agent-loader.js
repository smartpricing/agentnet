import fs from 'fs'
import { parse } from 'yaml'
import { Gemini } from "../index.js"
import { Agent } from "./agent.js"
import { logger } from "../utils/logger.js"
import { ConfigurationError } from "../errors/index.js"
import { validateApiVersion, DEFAULT_API_VERSION, API_VERSIONS } from '../utils/version.js'

/**
 * Version handlers for different API versions
 */
const VERSION_HANDLERS = {
    'smartagent.io/v1alpha1': processV1Alpha1Definition,
    'agentnet.io/v1alpha1': processV1Alpha1Definition
    // Additional version handlers can be added here as the API evolves
};

/**
 * Loads agent definitions from a YAML file
 * @param {string} path - Path to the YAML file
 * @param {object} config - Configuration options
 * @returns {Promise<object>} Map of loaded agents
 */
export async function AgentLoaderFile(path, config) {
    try {
        const yamlFileContent = fs.readFileSync(path, 'utf8');
        const agentDefinitions = parseAgentDefinitionsFromYaml(yamlFileContent);
        return await AgentLoader(agentDefinitions, config);
    } catch (error) {
        throw new Error(`Failed to load agents from file ${path}: ${error.message}`);
    }
}

/**
 * Loads agent definitions from JSON
 * @param {object} json - JSON definition
 * @param {object} config - Configuration options
 * @returns {Promise<object>} Map of loaded agents
 */
export async function AgentLoaderJSON(json, config) {
    return await AgentLoader([json], config);
}

/**
 * Parses agent definitions from YAML content
 * @param {string} yamlContent - YAML content to parse
 * @returns {Array} Array of agent definitions
 */
function parseAgentDefinitionsFromYaml(yamlContent) {
    const agentDefsYaml = yamlContent.split(/^---$/m)
        .map(s => s.trim())
        .filter(s => s);
    
    const agentDefinitions = [];
    
    for (const agentDef of agentDefsYaml) {
        try {
            const definition = parse(agentDef);
            if (isValidAgentDefinition(definition)) {
                agentDefinitions.push(definition);
            } else {
                logger.warn("Skipping invalid or non-AgentDefinition document in YAML.");
            }
        } catch (error) {
            logger.warn(`Failed to parse YAML document: ${error.message}`);
        }
    }
    
    return agentDefinitions;
}

/**
 * Checks if a definition is a valid agent definition
 * @param {object} definition - Definition to validate
 * @returns {boolean} Whether definition is valid
 */
function isValidAgentDefinition(definition) {
    return definition && definition.kind === 'AgentDefinition' && definition.spec;
}

/**
 * Gets the appropriate version handler for a definition
 * @param {object} definition - Agent definition
 * @returns {Function} Version handler function
 * @throws {ConfigurationError} If version is unsupported
 */
function getVersionHandler(definition) {
    // Validate the API version using our utility
    const versionData = validateApiVersion(definition);
    const apiVersion = versionData.version;
    
    // Get the appropriate handler for this version
    const handler = VERSION_HANDLERS[apiVersion];
    
    if (!handler) {
        throw new ConfigurationError(
            `No implementation handler for apiVersion '${apiVersion}'`,
            { apiVersion, supportedHandlers: Object.keys(VERSION_HANDLERS) }
        );
    }
    
    return handler;
}

/**
 * Process a v1alpha1 agent definition
 * @param {object} definition - Agent definition
 * @param {object} agentBuilder - Agent builder
 * @param {object} bindings - IO and store bindings
 * @returns {object} Processed agent interface and tool map
 */
async function processV1Alpha1Definition(definition, agentBuilder, bindings) {
    const spec = definition.spec;
    
    // Add apiVersion to agent metadata
    agentBuilder.setMetadata({
        ...agentBuilder._config.metadata,
        apiVersion: definition.apiVersion || DEFAULT_API_VERSION
    });
    
    // Configure different aspects of the agent
    agentBuilder = configureIO(agentBuilder, spec.io, bindings);
    agentBuilder = configureStore(agentBuilder, spec.store, bindings);
    agentBuilder = await configureLLM(agentBuilder, spec.llm);
    agentBuilder = configureDiscoverySchemas(agentBuilder, spec.discoverySchemas);
    
    // Set up tools
    const toolMap = configureTools(agentBuilder, spec.tools);
    
    return { agentBuilder, toolMap };
}

/**
 * Loads an LLM provider instance
 * @param {string} providerName - Name of the provider
 * @returns {object} LLM provider instance
 */
async function loadLlmProvider(providerName) {
    if (providerName === 'Gemini') {
        return Gemini;
    }
    
    try {
        return global[providerName] || await import(providerName);
    } catch (error) {
        throw new Error(`LLM Provider "${providerName}" could not be loaded: ${error.message}`);
    }
}

/**
 * Configures IO for an agent
 * @param {object} agentBuilder - Agent builder instance
 * @param {Array} ioDefinitions - IO definitions
 * @param {object} bindings - IO bindings
 * @returns {object} Updated agent builder
 */
function configureIO(agentBuilder, ioDefinitions, bindings) {
    if (!ioDefinitions || !Array.isArray(ioDefinitions)) {
        return agentBuilder;
    }
    
    for (const ioDef of ioDefinitions) {
        if (!bindings[ioDef.type]) {
            throw new Error(`Missing binding for IO type: ${ioDef.type}`);
        }
        
        if (ioDef.type === 'NatsIO') {
            agentBuilder = agentBuilder.addIO(bindings[ioDef.type], ioDef);
        } else {
            throw new Error(`Unsupported IO type: ${ioDef.type}`);
        }
    }
    
    return agentBuilder;
}

/**
 * Configures store for an agent
 * @param {object} agentBuilder - Agent builder instance
 * @param {object} storeSpec - Store specification
 * @param {object} bindings - Store bindings
 * @returns {object} Updated agent builder
 */
function configureStore(agentBuilder, storeSpec, bindings) {
    if (!storeSpec) {
        return agentBuilder;
    }
    
    const storeType = storeSpec.type;
    
    if (!bindings[storeType]) {
        throw new Error(`Missing binding for store type: ${storeType}`);
    }
    
    // Add store to agent builder
    return agentBuilder.withStore(bindings[storeType], storeSpec);
}

/**
 * Configures LLM for an agent
 * @param {object} agentBuilder - Agent builder instance
 * @param {object} llmSpec - LLM specification
 * @returns {Promise<object>} Updated agent builder
 */
async function configureLLM(agentBuilder, llmSpec) {
    if (!llmSpec) {
        return agentBuilder;
    }
    
    const llmProviderInstance = await loadLlmProvider(llmSpec.provider);
    
    return agentBuilder.withLLM(llmProviderInstance, {
        model: llmSpec.model,
        systemInstruction: llmSpec.systemInstruction,
        config: llmSpec.config
    });
}

/**
 * Configures discovery schemas for an agent
 * @param {object} agentBuilder - Agent builder instance
 * @param {Array} schemas - Discovery schemas
 * @returns {object} Updated agent builder
 */
function configureDiscoverySchemas(agentBuilder, schemas) {
    if (!schemas || !Array.isArray(schemas)) {
        return agentBuilder;
    }
    
    for (const schema of schemas) {
        agentBuilder = agentBuilder.addDiscoverySchema(schema);
    }
    
    return agentBuilder;
}

/**
 * Configures tools for an agent
 * @param {object} agentBuilder - Agent builder instance
 * @param {Array} toolsSpec - Tools specification
 * @returns {object} Tool map
 */
function configureTools(agentBuilder, toolsSpec) {
    const toolMap = {};
    
    if (!toolsSpec || !Array.isArray(toolsSpec)) {
        return toolMap;
    }
    
    for (const toolDef of toolsSpec) {
        agentBuilder._config.toolsSchemas[toolDef.name] = {
            name: toolDef.name,
            schema: toolDef,
            function: null
        };
        
        toolMap[toolDef.name] = {
            bind: (handlerFunction) => {
                agentBuilder._config.toolsSchemas[toolDef.name].function = handlerFunction;
            }
        };
    }
    
    return toolMap;
}

/**
 * Creates an agent interface
 * @param {object} agentBuilder - Agent builder instance
 * @param {object} toolMap - Tool map
 * @returns {object} Agent interface
 */
function createAgentInterface(agentBuilder, toolMap) {
    return {
        tools: toolMap,
        prompt: (callback) => {
            agentBuilder._config.on.prompt = callback;
        },
        response: (callback) => {
            agentBuilder._config.on.response = callback;
        },
        compile: async () => {
            return await agentBuilder.compile();
        }
    };
}

/**
 * Main agent loading function
 * @param {Array} agentsDefinitions - Array of agent definitions
 * @param {object} config - Configuration options
 * @returns {Promise<object>} Map of loaded agents
 */
async function AgentLoader(agentsDefinitions, config = {}) {
    const bindings = config.bindings || {};
    const loadedAgents = {};

    for (const definition of agentsDefinitions) {
        try {
            if (!definition.spec) {
                throw new Error(`Invalid agent definition: missing spec`);
            }
            
            const metadata = definition.metadata || { 
                name: "default", 
                description: "Agent from definition" 
            };
            
            if (!metadata.name) {
                throw new Error("Agent definition is missing metadata.name");
            }
            
            // Initialize agent builder with metadata
            let agentBuilder = Agent().setMetadata(metadata);
            
            // Get the appropriate version handler
            const versionHandler = getVersionHandler(definition);
            
            // Process according to API version
            const { agentBuilder: updatedBuilder, toolMap } = 
                await versionHandler(definition, agentBuilder, bindings);
            
            // Create the agent interface
            loadedAgents[metadata.name] = createAgentInterface(updatedBuilder, toolMap);
            
            logger.info(`Agent '${metadata.name}' loaded successfully with apiVersion: ${definition.apiVersion || DEFAULT_API_VERSION}`);
            
        } catch (error) {
            const agentName = definition.metadata?.name || 'Unnamed Agent';
            logger.error(`Failed to load agent "${agentName}": ${error.message}`, { error });
            // Optional: decide whether to throw or just log and continue
            // throw error;
        }
    }

    return loadedAgents;
}