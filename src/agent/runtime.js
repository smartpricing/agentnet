import { build, makeToolsAndHandoffsMap } from "./executor.js"

async function NatsIOAgentRuntime (agentName, ioInterfaces, discoverySchemas) {
    if (ioInterfaces.length > 1) {
        throw new Error('Only one IO Nats interface is supported')
    }
    if (ioInterfaces.length == 0) {
        return
    }
    let intervals = []
    const intervalTime = 1000
    let taskSubscriptions = []
    let handoffSubscriptions = []
    let discoverySubscriptions = []
    const io = ioInterfaces[0]

    const nc = await io.instance.connect()

    const discoveryTopic = io.config.bindings.discoveryTopic

    // Step 1. Subscribe to discovery topic
    const discoveredAgents = {}
    const discoverySub = nc.subscribe(discoveryTopic)
    const handleDiscovery = async () => {
        for await (const m of discoverySub) {
            const payloadSetup = JSON.parse(m.string())
            for (const schema of payloadSetup.schemas) {
                const agentKey = payloadSetup.agentName + "-" + schema.name
                if (payloadSetup.agentName !== agentName && !discoveredAgents[agentKey]) {
                    console.log(`${agentName} Discovered`, payloadSetup.agentName, schema.name)
                    const handoffFunction = async (conversation, state, input) => {
                        const response = await nc.request(payloadSetup.agentName, JSON.stringify({
                            state: state,
                            conversation: conversation,
                            input: input
                        }), { timeout: 60000 })
                        //console.log("handoffFunction", response.string())
                        return response.string()
                    }
                    discoveredAgents[agentKey] = {
                        name: schema.name, 
                        schema: schema, 
                        function: handoffFunction
                    }
                }
            }
        }
    }
    handleDiscovery()

    // Step 2. Publish discovery heartbeat
    const interval = setInterval(async () => {
        //console.log(`${discoveryTopic} sending discovery heartbeat`)
        await nc.publish(discoveryTopic, JSON.stringify({
            type: 'discovery',
            agentName: agentName,
            schemas: discoverySchemas
        }))
    }, intervalTime)

	const handleTask = async (fn) => {
        const taskSub = nc.subscribe(agentName, { queue: agentName })
        for await (const m of taskSub) {
            //console.log('handleTask', m.string())
            const payload = m.json()
            const response = await fn(payload.state, payload.conversation, payload.input)
            await m.respond(typeof response === 'string' ? response : JSON.stringify(response))
        }

	}    

    return { handleTask, discoveredAgents }
}

export async function AgentRuntime (agentConfig) {
    let toolsAndHandoffsMap = agentConfig.toolsAndHandoffsMap
    const hooks = agentConfig.hooks
    const agentName = agentConfig.metadata.name
    const llmApi = agentConfig.llm.api
    const llmConfig = agentConfig.llm.config
    const runner = agentConfig.runner
    const tools = agentConfig.toolsSchemas
    const handoffs = agentConfig.handoffs
    const ioInterfaces = agentConfig.io
    const discoverySchemas = agentConfig.discoverySchemas
    
    const { handleTask, discoveredAgents } = await NatsIOAgentRuntime(agentName, ioInterfaces.filter(x => x.type == 'NatsIO'), discoverySchemas)
    

    const executor = await build(
        toolsAndHandoffsMap, 
        hooks, 
        agentName, 
        llmApi, 
        llmConfig, 
        runner)

    const taksFunction = async function (state, conversation, input) {
        makeToolsAndHandoffsMap(toolsAndHandoffsMap, Object.values(tools), [handoffs, Object.values(discoveredAgents)])
        await llmApi.prompt(conversation, typeof input === 'string' ? input : JSON.stringify(input))
        const result = await executor(state, conversation)
        return result
    }

    handleTask(taksFunction)    

    return taksFunction
}