import OpenAI from 'openai'
import { logger } from '../utils/logger.js'
import { LLMError } from '../errors/index.js'
import { BaseLLM } from './base.js'
import { Conversation } from '../utils/conversation.js'

/**
 * OpenAI LLM implementation
 */
class OpenAILLM extends BaseLLM {
	constructor() {
		super('openai');
	}

	/**
	 * Initializes and returns an OpenAI client
	 * @returns {Promise<OpenAI>} The initialized OpenAI client
	 * @throws {LLMError} If initialization fails
	 */
	async getClient() {
		this.checkApiKey('OPENAI_API_KEY');
		
		try {
			logger.debug('Initializing OpenAI client');
			return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
		} catch (error) {
			logger.error('Failed to initialize OpenAI client', { error });
			throw new LLMError(
				`Failed to initialize OpenAI client: ${error.message}`,
				this.type,
				{ originalError: error }
			);
		}
	}

	/**
	 * Calls the OpenAI model with the provided configuration and context
	 * @param {Object} llmClientConfig - Configuration for the OpenAI model
	 * @param {Object} context - Context containing client, tools map and conversation
	 * @returns {Promise<Object>} The model response
	 * @throws {LLMError} If the API call fails
	 */
	async callModel(llmClientConfig, context) {
		const { client, toolsAndHandoffsMap, conversation } = context;
		const input = { ...llmClientConfig };
		input.tools = toolsAndHandoffsMap.tools;
		
		// Get raw conversation if it's a Conversation object
		input.input = conversation instanceof Conversation
			? conversation.getRawConversation()
			: conversation;
		
		logger.debug('Calling OpenAI model', { 
			model: input.model,
			conversationLength: input.input.length,
			toolsCount: toolsAndHandoffsMap.tools.length
		});
		//console.log(JSON.stringify(input, null, 2))
		try {
			const response = await client.responses.create(input);
			logger.debug('OpenAI response received');
			return response;
		} catch (error) {
			logger.error('OpenAI API error', { 
				error: error.message,
				modelName: input.model
			});
			
			throw new LLMError(
				`OpenAI API error: ${error.message}`,
				this.type,
				{
					statusCode: error.status || error.statusCode,
					modelName: input.model
				}
			);
		}
	}

	/**
	 * Handle a specific tool call from OpenAI response
	 * @param {Object} toolCall - The tool call to process
	 * @param {Object} state - Current application state
	 * @param {Array|Conversation} conversation - The conversation history
	 * @param {Object} toolsAndHandoffsMap - Map of available tools
	 */
	async handleToolCall(toolCall, state, conversation, toolsAndHandoffsMap) {
		try {
			const args = JSON.parse(toolCall.arguments);
			const name = toolCall.name;
			
			logger.debug('Executing tool from OpenAI', { 
				toolName: name,
				argsPreview: JSON.stringify(args).substring(0, 100),
				callId: toolCall.call_id
			});
			
			const result = await super.executeToolCall(toolCall, name, args, state, toolsAndHandoffsMap);
			
			// Add function call to conversation
			if (conversation instanceof Conversation) {
				conversation.addFunctionCall(toolCall);
			} else {
				conversation.push(toolCall);
			}
			
			const resultString = typeof result === 'string' ? result : JSON.stringify(result);
			
			logger.debug('Tool execution successful', { 
				toolName: name,
				resultPreview: resultString.substring(0, 100)
			});
			
			const functionOutput = {        
				type: "function_call_output",
				call_id: toolCall.call_id,
				output: resultString
			};
			
			// Add function result to conversation
			if (conversation instanceof Conversation) {
				conversation.addFunctionResult(functionOutput);
			} else {
				conversation.push(functionOutput);
			}
		} catch (error) {
			logger.error(`Error executing tool "${toolCall.name}"`, { error });
			
			// Add error as function output
			if (conversation instanceof Conversation) {
				conversation.addFunctionCall(toolCall);
				
				const errorOutput = {
					type: "function_call_output",
					call_id: toolCall.call_id,
					output: JSON.stringify({ error: error.message })
				};
				
				conversation.addFunctionResult(errorOutput);
			} else {
				conversation.push(toolCall);
				conversation.push({
					type: "function_call_output",
					call_id: toolCall.call_id,
					output: JSON.stringify({ error: error.message })
				});
			}
		}
	}

	/**
	 * Processes the model response, handling text responses and function calls
	 * @param {Object} state - Current application state
	 * @param {Array|Conversation} conversation - The conversation history
	 * @param {Object} toolsAndHandoffsMap - Map of available tools
	 * @param {Object} response - The model response to process
	 * @returns {Promise<string|null>} Text response or null if processing tool calls
	 */
	async onResponse(state, conversation, toolsAndHandoffsMap, response) {
		if (response.output_text !== undefined && response.output_text.length > 0 ) {
			logger.debug('OpenAI response contains text, returning directly');
			
			// Add model response to conversation if using Conversation object
			if (conversation instanceof Conversation) {
				conversation.addModelResponse({
					role: 'assistant',
					content: response.output_text
				});
			}
			
			return response.output_text;
		}

		const reasoning = response.output.filter(x => x.type === 'reasoning');
		const functionCalls = response.output.filter(x => x.type === 'function_call');
		
		logger.debug('OpenAI response processing', {
			reasoningCount: reasoning.length,
			functionCallCount: functionCalls.length
		});
		
		// Add reasoning to conversation
		for (const res of reasoning) {
			if (conversation instanceof Conversation) {
				conversation.addModelResponse(res);
			} else {
				conversation.push(res);
			}
		}

		// Process all tool calls sequentially
		for (const toolCall of functionCalls) {
			await this.handleToolCall(toolCall, state, conversation, toolsAndHandoffsMap);
		}
		
		return null;
	}

	/**
	 * Adds a user prompt to the conversation
	 * @param {Array|Conversation} conversation - The conversation history
	 * @param {string} formattedPrompt - The formatted user prompt
	 * @returns {Promise<void>}
	 */
	async prompt(conversation, formattedPrompt) {
		await super.prompt(conversation, formattedPrompt);
		
		const userMessage = {
			role: 'user',
			content: formattedPrompt
		};
		
		if (conversation instanceof Conversation) {
			conversation.addUserMessage(userMessage);
		} else {
			conversation.push(userMessage);
		}
	}
}

// Create a singleton instance
const openaiLLM = new OpenAILLM();

export default {
	type: openaiLLM.type,
	getClient: openaiLLM.getClient.bind(openaiLLM),
	prompt: openaiLLM.prompt.bind(openaiLLM),
	callModel: openaiLLM.callModel.bind(openaiLLM),
	onResponse: openaiLLM.onResponse.bind(openaiLLM)
}