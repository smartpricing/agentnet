import { Message, Response } from '../index.js'

export function AgentClient(config = {}) {
    const requestTimeout = config.requestTimeout || 120000
    
    return {
        queryAgent: async (agent, input) => {
            return await agent.query(input)
        },

        queryIo: async (io, namespace, name, message) => {
            const transport = await io.connect()
            const target = namespace + '.' + name
            const response = await transport.request(target, message.serialize(), { timeout: requestTimeout })
            return new Response(JSON.parse(response.string()))
        }
    }
}