import fs from 'fs'
import { parse } from 'yaml'
import { Gemini } from "../index.js"
import { Agent } from "./agent.js"

export async function AgentLoaderFile (path, config) {
    const yamlFileContent = fs.readFileSync(path, 'utf8');
    const agentDefsYaml = yamlFileContent.split(/^---$/m).map(s => s.trim()).filter(s => s);    
    let agentDefsJson = []
    for (const agentDef of agentDefsYaml) {
        const definition = parse(agentDef)
        if (!definition || !definition.kind || definition.kind !== 'AgentDefinition') {
            console.warn("Skipping invalid or non-AgentDefinition document in YAML file.");
            continue;
        }        
        agentDefsJson.push(definition)
    }
    return await AgentLoader(agentDefsJson, config)
}

export async function AgentLoaderJSON (json, config) {
    const agentDefsJson = JSON.parse(json)
    return await AgentLoader([agentDefsJson], config)
}
    
export async function AgentLoader (agentsDefinitions, config) {
    const bindings = config.bindings

    const loadedAgents = {};

    for (const singleAgent of agentsDefinitions) {
        const definition = singleAgent
        if (!definition.spec) {
            throw new Error(`Invalid agent definition for "${definition.metadata?.name || 'Unnamed Agent'}": missing spec`);
        }
        
        const spec = definition.spec;
        const metadata = definition.metadata || { name: "default", description: "Agent from YAML definition" };
        
        let agentBuilder = Agent()
        
        agentBuilder.setMetadata(metadata)

        if (spec.io && Array.isArray(spec.io)) {
            for (const ioDef of spec.io) {
                if (ioDef.type === 'NatsIO') {
                    agentBuilder = agentBuilder.addIO(bindings[ioDef.type], ioDef)
                } else {
                    throw new Error(`Unsupported IO type: ${ioDef.type}`)
                }
            }
        }
        
        if (spec.llm) {
            const llmProviderName = spec.llm.provider;
            let llmProviderInstance;
            if (llmProviderName === 'Gemini') {
                llmProviderInstance = Gemini;
            } else {
                try {
                    llmProviderInstance = global[llmProviderName] || await import(llmProviderName);
                } catch (e) {
                    throw new Error (`LLM Provider "${llmProviderName}" could not be loaded. Ensure it's available.`);
                }
            }
            
            agentBuilder = agentBuilder.withLLM(llmProviderInstance, {
                model: spec.llm.model,
                systemInstruction: spec.llm.systemInstruction,
                config: spec.llm.config
            });
        }
        
        if (spec.discoverySchemas && Array.isArray(spec.discoverySchemas)) {
            for (const schema of spec.discoverySchemas) {
                agentBuilder = agentBuilder.addDiscoverySchema(schema);
            }
        }
        
        let toolMap = {}
        if (spec.tools && Array.isArray(spec.tools)) {
            for (const toolDef of spec.tools) {
                agentBuilder._config.toolsSchemas[toolDef.name] = {
                    name: toolDef.name,
                    schema: toolDef,
                    function: null
                }
                toolMap[toolDef.name] = {
                    bind: (handlerFunction) => {
                        agentBuilder._config.toolsSchemas[toolDef.name].function = handlerFunction
                    }
                }
            }
        }
        if (metadata.name) {
            loadedAgents[metadata.name] = {
                tools: toolMap,
                prompt: (callback) => {
                    agentBuilder._config.on.prompt = callback
                },
                response: (callback) => {
                    agentBuilder._config.on.response = callback
                },
                compile: async () => {
                    return await agentBuilder.compile()
                }
            };
        } else {
            throw new Error("Agent definition in YAML is missing metadata.name, it will not be individually accessible by name from AgentLoader.");
        }
    }
    return loadedAgents;
}