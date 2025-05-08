import { Agent,  NatsIO, Gemini } from "../index.js"

const basicAgent = await Agent()
.addIO(NatsIO({
	servers: ['nats://localhost:4222']
}), {
	tasks: ['basicagent'],
	handoffs: ['mathagents.*']
})
.withLLM(Gemini, {
	model: 'gemini-2.0-flash',
	systemInstruction: `
		You are an traveler agency agent.
		Your role is to answer about the traveler (user) reservation.
	  `,
	config: {
		temperature: 0,
		toolConfig: {
			functionCallingConfig: {
				mode: 'auto'
			}
		}
	}	
})
.on('prompt', async (state, input) => {
	return input
})
.compile()

const mathAgent = await Agent()
.addIO(NatsIO({
	servers: ['nats://localhost:4222']
}), {
	tasks: ['mathagents.v1']
})
.withLLM(Gemini, {
	model: 'gemini-2.0-flash',
	systemInstruction: `
		You are an traveler agency agent.
		Your role is to answer about the traveler (user) reservation.
	  `,
	config: {
		temperature: 0,
		toolConfig: {
			functionCallingConfig: {
				mode: 'auto'
			}
		}
	}	
})
.addDiscoverySchema({
	name: 'math_agent',
	type: 'function',
	description: 'Solve the math problem',
	  parameters: {
		type: 'object',
		properties: {
		  question: {
			type: 'string',
			description: 'Math problem to solve',
		  }
		},
		required: ['question']
	  }
})
.on('prompt', async (state, input) => {
	return input
})
.compile()

const result = await basicAgent.query("How 2 + 2 is?")
console.log(result)


