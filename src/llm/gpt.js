import OpenAI from 'openai'
import { Debug, Info } from '../misc/logger.js'
const type = 'openai' 

const getClient = async function () {
	return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

const callModel = async function (llmClientConfig, context) {
	const client = context.client
	const toolsAndHandoffsMap = context.toolsAndHandoffsMap
	const conversation = context.conversation
    const input = {}	
    Object.assign(input, llmClientConfig)
    input['tools'] = toolsAndHandoffsMap.tools
    input['input'] = conversation
    Debug('OpenAI callModel with',input)
	return await client.responses.create(input)
}

const onResponse = async function (state, conversation, toolsAndHandoffsMap, response) {
	if (response.output_text !== undefined && response.output_text.length > 0) {
		conversation.push({ role: 'model', parts: [{ text: response.output_text }] });
		return response.output_text
	}

	const reasoning = response.output.filter(x => x.type == 'reasoning')
	const functionCalls = response.output.filter(x => x.type == 'function_call')
	
	for (const res of reasoning) {
		conversation.push(res)
	}

	for (const toolCall of functionCalls) {

	    const args = JSON.parse(toolCall.arguments)
	    const name = toolCall.name
	    Debug('OpenAI call function tool', name, args)
	    let result = await toolsAndHandoffsMap[name].function(conversation, state, args)
	    conversation.push(toolCall)
	    conversation.push({        
	        type: "function_call_output",
	        call_id: toolCall.call_id,
	        output: typeof result == 'string' ? result : JSON.stringify(result)
	    })
	}
	return null
}

const prompt = async function (conversation, formattedPrompt) {
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