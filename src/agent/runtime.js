import { build, makeToolsAndHandoffsMap } from "./executor.js"
import { NatsIOAgentRuntime } from "./runtimes/nats.js"
import { logger } from "../utils/logger.js"
import { Response } from "../index.js"

export async function AgentRuntime(agentConfig) {
    const {
        toolsAndHandoffsMap,
        hooks,
        metadata: { name: agentName },
        llm: { api: llmApi, config: llmConfig },
        runner,
        toolsSchemas: tools,
        handoffs,
        io: ioInterfaces,
        discoverySchemas,
        on: { prompt, response }
    } = agentConfig
    
    // Initialize IO runtime
    const natsInterfaces = ioInterfaces.filter(x => x.type === 'NatsIO')
    const { handleTask, discoveredAgents } = await NatsIOAgentRuntime(
        agentName, 
        natsInterfaces, 
        discoverySchemas
    )
    
    // Build executor
    const executor = await build(
        toolsAndHandoffsMap,
        hooks,
        agentName,
        llmApi,
        llmConfig,
        runner
    )

    // Create task processing function
    const taskFunction = async function(state, conversation, input) {
        try {
            // Update tools and handoffs map with discovered agents
            makeToolsAndHandoffsMap(
                toolsAndHandoffsMap, 
                Object.values(tools), 
                [handoffs, Object.values(discoveredAgents)]
            )
            
            // Process the input
            await llmApi.prompt(conversation, typeof input === 'string' ? input : JSON.stringify(input))
            
            // Execute and return result
            return await executor(state, conversation)
        } catch (error) {
            console.error("Task execution error:", error)
            return { error: "Failed to execute task", details: error.message }
        }
    }

    const queryFunction = async function(message) {
        try {
            const content = message.getContent()
            const session = message.getSession()
            // TODO load state from sessionId if not null from storage
            const state = {};
            const conversation = [];
            const formattedInput = typeof content === 'string' ? content : JSON.stringify(content);
            
            logger.debug(`Query to agent ${agentName}`, {
                inputPreview: formattedInput.substring(0, 100)
            });
            
            // Process input through prompt hook
            const promptContent = await prompt(state, formattedInput);
            
            // Execute agent runtime
            const result = await taskFunction(state, conversation, promptContent);
            
            // Process result through response hook
            const responseMessage = await response(state, conversation, result);
            const responseFormatted = new Response({
                content: responseMessage,
                session: session
            })
            return responseFormatted;
        } catch (error) {
            logger.error(`Agent query execution error: ${error.message}`, {
                agentName: agentName,
                error
            });
            throw error;
        }
    }    

    // Start handling tasks
    handleTask(queryFunction) // queryFunction
    

    return queryFunction // queryFunction
}