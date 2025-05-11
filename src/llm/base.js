import { logger } from '../utils/logger.js'
import { LLMError } from '../errors/index.js'

/**
 * Base class for LLM implementations
 * Provides common functionality and defines required interface
 */
export class BaseLLM {
  /**
   * @param {string} providerType - The LLM provider type (e.g., 'gemini', 'openai')
   */
  constructor(providerType) {
    this.type = providerType;
  }

  /**
   * Initialize and get the LLM client
   * @returns {Promise<any>} Initialized LLM client
   * @throws {LLMError} If initialization fails
   */
  async getClient() {
    throw new Error('getClient() must be implemented by subclasses');
  }

  /**
   * Call the LLM model with the provided configuration and context
   * @param {Object} config - LLM-specific configuration
   * @param {Object} context - Context containing client, tools map and conversation
   * @returns {Promise<Object>} The model response
   * @throws {LLMError} If the API call fails
   */
  async callModel(config, context) {
    throw new Error('callModel() must be implemented by subclasses');
  }

  /**
   * Process the model response, handling text responses and function calls
   * @param {Object} state - Current application state
   * @param {Array} conversation - The conversation history
   * @param {Object} toolsAndHandoffsMap - Map of available tools
   * @param {Object} response - The model response to process
   * @returns {Promise<string|null>} Text response or null if processing tool calls
   */
  async onResponse(state, conversation, toolsAndHandoffsMap, response) {
    throw new Error('onResponse() must be implemented by subclasses');
  }

  /**
   * Add a user prompt to the conversation
   * @param {Array} conversation - The conversation history
   * @param {string} formattedPrompt - The formatted user prompt
   * @returns {Promise<void>}
   */
  async prompt(conversation, formattedPrompt) {
    logger.debug('Adding user prompt to conversation', {
      promptPreview: formattedPrompt.substring(0, 100)
    });
    
    // Subclasses must implement appropriate conversation format
  }

  /**
   * Check if required API key is set in environment variables
   * @param {string} keyName - Environment variable name for the API key
   * @returns {void}
   * @throws {LLMError} If API key is not set
   */
  checkApiKey(keyName) {
    if (!process.env[keyName]) {
      throw new LLMError(
        `${keyName} environment variable is not set`,
        this.type
      );
    }
  }

  /**
   * Execute a tool call from the model response
   * @param {Object} toolCall - The tool call to execute
   * @param {Object} state - Current application state
   * @param {Array} conversation - The conversation history
   * @param {Object} toolsAndHandoffsMap - Map of available tools
   * @returns {Promise<any>} Result of the tool execution
   */
  async executeToolCall(toolCall, name, args, state, conversation, toolsAndHandoffsMap) {
    logger.debug(`Executing tool from ${this.type}`, { 
      toolName: name,
      argsPreview: JSON.stringify(args).substring(0, 100)
    });
    
    try {
      if (!toolsAndHandoffsMap[name] || !toolsAndHandoffsMap[name].function) {
        throw new Error(`Tool "${name}" not found or has no function implementation`);
      }

      let result = null;
      if (toolsAndHandoffsMap[name].type === 'handoff') {
        result = await toolsAndHandoffsMap[name].function(conversation, state, args);
        // Process handoff results if needed
        this.processHandoffResult(result, state);
      } else {
        result = await toolsAndHandoffsMap[name].function(state, args);
      }
      
      logger.debug('Tool execution successful', { toolName: name });
      return result;
      
    } catch (error) {
      logger.error(`Error executing tool "${name}"`, { error });
      throw error;
    }
  }
  
  /**
   * Process the result of a handoff operation
   * @param {string} result - The JSON string result from handoff
   * @param {Object} state - The state to update
   */
  processHandoffResult(result, state) {
    try {
      const resultParsed = JSON.parse(result);
      if (resultParsed.session) {
        Object.entries(resultParsed.session).forEach(([key, value]) => {
          state[key] = value;
        });
      }
    } catch (error) {
      logger.error('Failed to process handoff result', { error });
    }
  }
} 