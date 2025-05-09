export function AgentClient() {
    return {
        queryAgent: async (agent, input) => {
            return await agent.query(input)
        },

        queryIo: async (io, target, input, state) => {
            const transport = await io.connect()
            return (await transport.request(target, JSON.stringify({
                state: state || {},
                conversation: [],
                input: input
            }), { timeout: 60000 })).string()
        }
    }
}