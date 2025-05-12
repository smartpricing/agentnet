import { GoogleGenAI } from '@google/genai'
import { logger } from '../utils/logger.js'
import { LLMError } from '../errors/index.js'
import { BaseLLM } from './base.js'

/**
 * Gemini LLM implementation
 */
class GeminiLLM extends BaseLLM {
  constructor() {
    super('gemini');
  }

  /**
   * Initializes and returns a Gemini client
   * @returns {Promise<GoogleGenAI>} The initialized Gemini client
   * @throws {LLMError} If initialization fails
   */
  async getClient() {
    this.checkApiKey('GEMINI_API_KEY');
    
    try {
      logger.debug('Initializing Gemini client');
      return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    } catch (error) {
      logger.error('Failed to initialize Gemini client', { error });
      throw new LLMError(
        `Failed to initialize Gemini client: ${error.message}`,
        this.type,
        { originalError: error }
      );
    }
  }

  /**
   * Calls the Gemini model with the provided configuration and context
   * @param {Object} llmClientConfig - Configuration for the Gemini model
   * @param {Object} context - Context containing client, tools map and conversation
   * @returns {Promise<Object>} The model response
   * @throws {LLMError} If the API call fails
   */
  async callModel(llmClientConfig, context) {
    const { client, toolsAndHandoffsMap, conversation } = context;
    const input = { ...llmClientConfig, contents: conversation };

    // Configure tools if provided
    if (input.config !== undefined && input.tools !== undefined) {
      input.config.tools = toolsAndHandoffsMap.tools;
    } else if (toolsAndHandoffsMap.tools.length > 0) {
      input.config = input.config || {};
      input.config.tools = [{ functionDeclarations: toolsAndHandoffsMap.tools }];
    }

    logger.debug('Calling Gemini model', { 
      model: input.model,
      conversationLength: conversation.length,
      toolsCount: toolsAndHandoffsMap.tools.length
    });
    
    try {
      const res = await client.models.generateContent(input);
      logger.debug('Gemini response received', {
        responseType: res.response?.candidates ? 'candidates' : 'unknown',
        hasContent: !!res.response?.candidates?.[0]?.content
      });
      return res;
    } catch (error) {
      console.log(error)
      logger.error('Gemini API error', { 
        error,
        modelName: input.model
      });
      
      throw new LLMError(
        `Gemini API error: ${error.message}`,
        this.type,
        {
          statusCode: error.status || error.statusCode,
          modelName: input.model
        }
      );
    }
  }

  /**
   * Handle a specific tool call from Gemini response
   * @param {Object} toolCall - The tool call to process
   * @param {Object} state - Current application state
   * @param {Array} conversation - The conversation history
   * @param {Object} toolsAndHandoffsMap - Map of available tools
   */
  async handleToolCall(toolCall, state, conversation, toolsAndHandoffsMap) {
    const args = toolCall.args;
    const name = toolCall.name;
    
    try {
      const result = await super.executeToolCall(toolCall, name, args, state, conversation, toolsAndHandoffsMap);
      
      // Add function call and response to conversation in Gemini-specific format
      const function_response_part = {
        name: name,
        response: typeof result === 'string' ? { answer: result } : result
      };
      
      conversation.push({ role: 'model', parts: [{ functionCall: toolCall }] });
      conversation.push({ role: 'user', parts: [{ functionResponse: function_response_part }] });
      
    } catch (error) {
      // Return error as function response in Gemini-specific format
      const errorResponse = {
        name: name,
        response: { error: error.message }
      };
      
      conversation.push({ role: 'model', parts: [{ functionCall: toolCall }] });
      conversation.push({ role: 'user', parts: [{ functionResponse: errorResponse }] });
    }
  }

  /**
   * Processes the model response, handling text responses and function calls
   * @param {Object} state - Current application state
   * @param {Array} conversation - The conversation history
   * @param {Object} toolsAndHandoffsMap - Map of available tools
   * @param {Object} response - The model response to process
   * @returns {Promise<string|null>} Text response or null if processing tool calls
   */
  async onResponse(state, conversation, toolsAndHandoffsMap, response) {
    // Handle simple text response
    if (response.text !== undefined) {
      logger.debug('Gemini response contains text, returning directly');
      conversation.push({ role: 'model', parts: [{ text: response.text }] });
      return response.text;
    }
    
    // Handle function calls
    logger.debug('Gemini response contains function calls', {
      functionCallCount: response.functionCalls?.length || 0
    });
    
    // Process all tool calls sequentially
    if (response.functionCalls?.length) {
      for (const toolCall of response.functionCalls) {
        await this.handleToolCall(toolCall, state, conversation, toolsAndHandoffsMap);
      }
    }
    
    return null;
  }

  /**
   * Adds a user prompt to the conversation
   * @param {Array} conversation - The conversation history
   * @param {string} formattedPrompt - The formatted user prompt
   * @returns {Promise<void>}
   */
  async prompt(conversation, formattedPrompt) {
    await super.prompt(conversation, formattedPrompt);
    
    conversation.push({
      role: 'user',
      parts: [{ text: formattedPrompt }]
    });
  }
}

// Create a singleton instance
const geminiLLM = new GeminiLLM();

export default {
  type: geminiLLM.type,
  getClient: geminiLLM.getClient.bind(geminiLLM),
  prompt: geminiLLM.prompt.bind(geminiLLM),
  callModel: geminiLLM.callModel.bind(geminiLLM),
  onResponse: geminiLLM.onResponse.bind(geminiLLM)
}