import { Message, Response } from '../index.js'
export function AgentClient() {
    return {
        queryAgent: async (agent, input) => {
            return await agent.query(input)
        },

        queryIo: async (io, target, message) => {
            const transport = await io.connect()
            const response = await transport.request(target, message.serialize(), { timeout: 60000 })
            return new Response(JSON.parse(response.string()))
        }
    }
}