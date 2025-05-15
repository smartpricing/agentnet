import { build, makeToolsAndHandoffsMap } from "./executor.js"
import { logger } from "../utils/logger.js"
import { Response, SessionStore } from "../index.js"
import { createAgentRuntime } from "../transport/index.js"

export async function AgentRuntime(agentConfig) {
    const {
        toolsAndHandoffsMap,
        hooks,
        store,
        metadata: { name: agentName, namespace },
        llm: { api: llmApi, config: llmConfig },
        runner,
        toolsSchemas: tools,
        handoffs,
        io: ioInterfaces,
        discoverySchemas,
        on: { prompt, response }
    } = agentConfig
    
    // Initialize IO runtime
    const transportType = ioInterfaces.length > 0 ? ioInterfaces[0].type.replace('IO', '').toLowerCase() : 'nats';
    logger.info(`Creating agent runtime with transport type: ${transportType}`);
    
    const { handleTask, discoveredAgents } = await createAgentRuntime(
        transportType,
        namespace,
        agentName, 
        ioInterfaces, 
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
                llmApi.type,
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
            const storeStateSessionId = namespace + "." + agentName + "." + sessionId
            console.log("---->", storeStateSessionId)

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

            // Before returning, remove _ from the state
            // Keep the removed keys and print the removed keys 
            const removedKeys = []
            for (const key of Object.keys(storeState.state)) {
                if (key.startsWith('_')) {
                    removedKeys.push(key)
                    delete storeState.state[key]
                }
            }
            if (removedKeys.length > 0) {
                logger.info(`Removed keys from state for agent ${agentName}: ${removedKeys.join(', ')}`);
            }

            const responseFormatted = new Response({
                content: responseMessage,
                session: storeState.state
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