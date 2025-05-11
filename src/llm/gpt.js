import OpenAI from 'openai'
import { logger } from '../utils/logger.js'
import { LLMError } from '../errors/index.js'

const type = 'openai' 

const getClient = async function () {
	try {
		if (!process.env.OPENAI_API_KEY) {
			throw new LLMError(
				'OPENAI_API_KEY environment variable is not set',
				'openai'
			);
		}
		
		logger.debug('Initializing OpenAI client');
		return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
	} catch (error) {
		logger.error('Failed to initialize OpenAI client', { error });
		throw new LLMError(
			`Failed to initialize OpenAI client: ${error.message}`,
			'openai',
			{ originalError: error }
		);
	}
}

const callModel = async function (llmClientConfig, context) {
	const client = context.client
	const toolsAndHandoffsMap = context.toolsAndHandoffsMap
	const conversation = context.conversation
	const input = {}	
	Object.assign(input, llmClientConfig)
	input['tools'] = toolsAndHandoffsMap.tools
	input['input'] = conversation
	
	logger.debug('Calling OpenAI model', { 
		model: input.model,
		conversationLength: conversation.length,
		toolsCount: toolsAndHandoffsMap.tools.length
	});
	
	try {
		const response = await client.responses.create(input)
		logger.debug('OpenAI response received');
		return response
	} catch (error) {
		logger.error('OpenAI API error', { 
			error,
			modelName: input.model
		});
		
		throw new LLMError(
			`OpenAI API error: ${error.message}`,
			'openai',
			{
				statusCode: error.status || error.statusCode,
				modelName: input.model
			}
		);
	}
}

const onResponse = async function (state, conversation, toolsAndHandoffsMap, response) {
	if (response.output_text !== undefined && response.output_text.length > 0) {
		logger.debug('OpenAI response contains text, returning directly');
		conversation.push({ role: 'model', parts: [{ text: response.output_text }] });
		return response.output_text
	}

	const reasoning = response.output.filter(x => x.type == 'reasoning')
	const functionCalls = response.output.filter(x => x.type == 'function_call')
	
	logger.debug('OpenAI response processing', {
		reasoningCount: reasoning.length,
		functionCallCount: functionCalls.length
	});
	
	for (const res of reasoning) {
		conversation.push(res)
	}

	for (const toolCall of functionCalls) {
		try {
			const args = JSON.parse(toolCall.arguments)
			const name = toolCall.name
			
			logger.debug('Executing tool from OpenAI', { 
				toolName: name,
				argsPreview: JSON.stringify(args).substring(0, 100),
				callId: toolCall.call_id
			});
			
			if (!toolsAndHandoffsMap[name] || !toolsAndHandoffsMap[name].function) {
				throw new Error(`Tool "${name}" not found or has no function implementation`);
			}
			
			let result = null
            if (toolsAndHandoffsMap[name].type === 'handoff') {
                result = await toolsAndHandoffsMap[name].function(conversation, state, args);
            } else {
                result = await toolsAndHandoffsMap[name].function(state, args);
            }			
			conversation.push(toolCall)
            if (toolsAndHandoffsMap[name].type === 'handoff') {
                console.log("GPT HANDOFF onResponse", name, result)
                const resultParsed = JSON.parse(result)
                // Update state with the result
                if (resultParsed.session) {
                    for (const key of Object.keys(resultParsed.session)) {
                        state[key] = resultParsed.session[key]
                    }
                }
            }			
			
			const resultString = typeof result == 'string' ? result : JSON.stringify(result)
			
			logger.debug('Tool execution successful', { 
				toolName: name,
				resultPreview: resultString.substring(0, 100)
			});
			
			conversation.push({        
				type: "function_call_output",
				call_id: toolCall.call_id,
				output: resultString
			})
		} catch (error) {
			logger.error(`Error executing tool "${toolCall.name}"`, { error });
			
			// Add error as function output
			conversation.push(toolCall);
			conversation.push({
				type: "function_call_output",
				call_id: toolCall.call_id,
				output: JSON.stringify({ error: error.message })
			});
		}
	}
	return null
}

const prompt = async function (conversation, formattedPrompt) {
	logger.debug('Adding user prompt to conversation', {
		promptPreview: formattedPrompt.substring(0, 100)
	});
	
	conversation.push({
		role: 'user',
		content: formattedPrompt
	})
}

export default {
	type,
	getClient,
	prompt,
	callModel,
	onResponse
}