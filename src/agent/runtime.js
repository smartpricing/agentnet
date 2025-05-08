import { build, makeToolsAndHandoffsMap } from "./executor.js"
import { NatsIOAgentRuntime } from "./runtimes/nats.js"

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
        discoverySchemas
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

    // Start handling tasks
    handleTask(taskFunction)

    return taskFunction
}