import { GoogleGenAI } from '@google/genai'
import { Debug, Info } from '../misc/logger.js'

const type = 'gemini' 

const getClient = async function () {
	return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
}

const callModel = async function (llmClientConfig, context) {
	const client = context.client
	const toolsAndHandoffsMap = context.toolsAndHandoffsMap
	const conversation = context.conversation
    const input = {}	
    Object.assign(input, llmClientConfig)

    input['contents'] = conversation

    if (input.config !== undefined && input.tools !== undefined) {
    	input.config.tools = toolsAndHandoffsMap.tools
    } else if (toolsAndHandoffsMap.tools.length > 0) {
    	if (input.config == undefined) {
    		input.config = {}
    	}
    	input.config.tools = [{functionDeclarations: toolsAndHandoffsMap.tools}]
  	}    

    Debug('Gemini callModel with', input)
    try {
    	const res = await client.models.generateContent(input)	
    	return res
    } catch (error) {
    	throw error
    }
}

const onResponse = async function (state, conversation, toolsAndHandoffsMap, response) {
    if (response.text !== undefined) {
		conversation.push({ role: 'model', parts: [{ text: response.text }] });
    	return response.text
    }
	
   	for (const toolCall of response.functionCalls) {
	    const args = toolCall.args
	    const name = toolCall.name   		
	    Debug('Gemini call function tool', name, args)
   	  	let result = await toolsAndHandoffsMap[name].function(conversation, state, args)
   	  	const function_response_part = {
   	  	  	name: name,
   	  	  	response: typeof result === 'string' ? { answer: result } : result
   	  	}
   	  	
   	  	// Append function call and result of the function execution to contents
   	  	conversation.push({ role: 'model', parts: [{ functionCall: toolCall }] });
   	  	conversation.push({ role: 'user', parts: [{ functionResponse: function_response_part }] });
   	}	
	return null
}

const prompt = async function (conversation, formattedPrompt) {
  	conversation.push({
      	role: 'user',
      	parts: [{ text: formattedPrompt}]
  	})
}


export default {
	type,
	getClient,
	prompt,
	callModel,
	onResponse
}