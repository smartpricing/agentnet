import { build, makeToolsAndHandoffsMap } from "./executor.js"
import { NatsIOAgentRuntime } from "./runtimes/nats.js"
import { logger } from "../utils/logger.js"
import { Response, SessionStore } from "../index.js"

export async function AgentRuntime(agentConfig) {
    const {
        toolsAndHandoffsMap,
        hooks,
        store,
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
            const sessionId = message.getSessionId()
            const storeStateSessionId = agentName + "." + sessionId

            // Load and merge session state and session data
            let storeState = {
                state: {},
                conversation: []
            }
            if (store && sessionId) {
                const sessionStore = new SessionStore(storeStateSessionId)
                await store.instance.connect()
                const _storeState = await sessionStore.load(store.instance)
                for (const key of Object.keys(_storeState.state)) {
                    storeState.state[key] = _storeState.state[key]
                }
                for (const key of Object.keys(session)) {
                    storeState.state[key] = session[key]
                }         
                storeState.conversation = _storeState.conversation
                logger.info(`Loaded session state for agent ${agentName} with session id ${storeStateSessionId}, current conversation length ${storeState.conversation.length}`);                
            }

            const formattedInput = typeof content === 'string' ? content : JSON.stringify(content);
            
            logger.debug(`Query to agent ${agentName}`, {
                inputPreview: formattedInput.substring(0, 100)
            });
            
            // Process input through prompt hook
            const promptContent = await prompt(storeState.state, formattedInput);
            
            // Execute agent runtime
            const result = await taskFunction(storeState.state, storeState.conversation, promptContent);
            // Process result through response hook
            const responseMessage = await response(storeState.state, storeState.conversation, result);

            // Save session state and session data
            if (store && sessionId) {
                const sessionStore = new SessionStore(storeStateSessionId)
                await store.instance.connect()
                sessionStore.setConversation(storeState.conversation)
                sessionStore.setState(storeState.state)
                sessionStore.trimConversation(10)
                await sessionStore.dump(store.instance)
                logger.info(`Dumped session state for agent ${agentName} with session id ${storeStateSessionId}, current conversation length ${storeState.conversation.length}`);                
            }
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