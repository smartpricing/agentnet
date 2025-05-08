/**
 * NATS Runtime implementation for agent communication
 */

const HEARTBEAT_INTERVAL = 1000
const TIMEOUT_TASK_REQUEST = 60000

/**
 * Sets up discovery subscription to find other agents
 */
async function setupDiscoverySubscription(nc, discoveryTopic, agentName, discoveredAgents) {
    const discoverySub = nc.subscribe(discoveryTopic)
    
    const handleDiscovery = async () => {
        try {
            for await (const m of discoverySub) {
                const payloadSetup = JSON.parse(m.string())
                for (const schema of payloadSetup.schemas) {
                    const agentKey = `${payloadSetup.agentName}-${schema.name}`
                    if (payloadSetup.agentName !== agentName && !discoveredAgents[agentKey]) {
                        console.log(`${agentName} Discovered`, payloadSetup.agentName, schema.name)
                        const handoffFunction = async (conversation, state, input) => {
                            try {
                                const response = await nc.request(
                                    payloadSetup.agentName, 
                                    JSON.stringify({ state, conversation, input }), 
                                    { timeout: TIMEOUT_TASK_REQUEST }
                                )
                                return response.string()
                            } catch (error) {
                                console.error(`Handoff error to ${payloadSetup.agentName}:`, error)
                                throw error
                            }
                        }
                        discoveredAgents[agentKey] = {
                            name: schema.name, 
                            schema: schema, 
                            function: handoffFunction
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Discovery subscription error:", error)
        }
    }
    
    // Start processing discovery messages
    handleDiscovery()
}

/**
 * Sets up a heartbeat to announce this agent's capabilities
 */
function setupDiscoveryHeartbeat(nc, discoveryTopic, agentName, discoverySchemas) {
    return setInterval(async () => {
        try {
            await nc.publish(discoveryTopic, JSON.stringify({
                type: 'discovery',
                agentName: agentName,
                schemas: discoverySchemas
            }))
        } catch (error) {
            console.error("Error publishing discovery heartbeat:", error)
        }
    }, HEARTBEAT_INTERVAL)
}

/**
 * Creates a task handler for incoming requests
 */
async function createTaskHandler(nc, agentName, processingFunction) {
    const taskSub = nc.subscribe(agentName, { queue: agentName })
    
    try {
        for await (const m of taskSub) {
            try {
                const payload = m.json()
                const response = await processingFunction(payload.state, payload.conversation, payload.input)
                await m.respond(typeof response === 'string' ? response : JSON.stringify(response))
            } catch (error) {
                console.error("Error processing task:", error)
                await m.respond(JSON.stringify({ error: "Failed to process task" }))
            }
        }
    } catch (error) {
        console.error("Task subscription error:", error)
    }
}

/**
 * Creates a NATS-based runtime for agent communication
 */
export async function NatsIOAgentRuntime(agentName, ioInterfaces, discoverySchemas) {
    if (ioInterfaces.length > 1) {
        throw new Error('Only one IO Nats interface is supported')
    }
    
    if (ioInterfaces.length === 0) {
        return { handleTask: async () => {}, discoveredAgents: [] }
    }
    
    const io = ioInterfaces[0]
    const intervals = []
    const discoveredAgents = {}
    
    try {
        const nc = await io.instance.connect()
        const discoveryTopic = io.config.bindings.discoveryTopic

        // Step 1. Subscribe to discovery topic
        await setupDiscoverySubscription(nc, discoveryTopic, agentName, discoveredAgents)

        // Step 2. Publish discovery heartbeat
        const interval = setupDiscoveryHeartbeat(nc, discoveryTopic, agentName, discoverySchemas)
        intervals.push(interval)

        // Step 3. Create task handler
        const handleTask = async (fn) => {
            await createTaskHandler(nc, agentName, fn)
        }

        return { handleTask, discoveredAgents }
    } catch (error) {
        // Clean up intervals if connection fails
        intervals.forEach(clearInterval)
        console.error("Failed to initialize NATS runtime:", error)
        throw error
    }
}
