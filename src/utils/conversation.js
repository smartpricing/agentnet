import { logger } from './logger.js';

/**
 * Class representing a conversation with additional metadata for each message
 */
export class Conversation {
  /**
   * Create a new Conversation instance
   */
  constructor() {
    // The internal conversation array with metadata
    this.messages = [];
  }

  /**
   * Add a message to the conversation
   * @param {Object} message - The message to add
   * @param {Object} metadata - Additional metadata
   * @param {string} metadata.type - Message type ('user_input', 'model_response', 'function_call', 'function_result')
   */
  addMessage(message, metadata = {}) {
    this.messages.push({
      content: message,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Add a user message to the conversation
   * @param {Object} message - The user message
   */
  addUserMessage(message) {
    this.addMessage(message, { type: 'user_input' });
  }

  /**
   * Add a model response to the conversation
   * @param {Object} message - The model response
   */
  addModelResponse(message) {
    this.addMessage(message, { type: 'model_response' });
  }

  /**
   * Add a function call to the conversation
   * @param {Object} message - The function call
   */
  addFunctionCall(message) {
    this.addMessage(message, { type: 'function_call' });
  }

  /**
   * Add a function result to the conversation
   * @param {Object} message - The function result
   */
  addFunctionResult(message) {
    this.addMessage(message, { type: 'function_result' });
  }

  /**
   * Get the conversation messages
   * @returns {Array} The messages in the conversation
   */
  getMessages() {
    return this.messages;
  }

  /**
   * Get the raw conversation history compatible with LLM providers
   * This strips out the metadata and returns just the message content
   * @returns {Array} The raw conversation history
   */
  getRawConversation() {
    return this.messages.map(message => message.content);
  }

  /**
   * Set the conversation from an existing array
   * @param {Array} conversation - Existing conversation array
   * @param {Object} options - Import options
   * @param {boolean} options.detectTypes - Try to automatically detect message types
   */
  importFromArray(conversation, options = { detectTypes: true }) {
    this.messages = [];
    
    if (!Array.isArray(conversation)) {
      logger.warn('Attempted to import non-array conversation');
      return;
    }

    for (const message of conversation) {
      let type = 'unknown';
      
      // Try to automatically detect message types if enabled
      if (options.detectTypes) {
        if (message.role === 'user') {
          // Check if it's a function response (from function result)
          if (message.parts && message.parts[0] && message.parts[0].functionResponse) {
            type = 'function_result';
          } else {
            type = 'user_input';
          }
        } else if (message.role === 'model' || message.role === 'assistant') {
          // Check if it's a function call
          if ((message.parts && message.parts[0] && message.parts[0].functionCall) || 
              message.type === 'function_call') {
            type = 'function_call';
          } else {
            type = 'model_response';
          }
        } else if (message.type === 'function_call') {
          type = 'function_call';
        } else if (message.type === 'function_call_output') {
          type = 'function_result';
        }
      }
      
      this.addMessage(message, { type });
    }
  }

  /**
   * Trim the conversation to a maximum number of elements
   * This will keep at least one user message at the start
   * @param {number} maxElements - Maximum number of elements to keep
   */
  trim(maxElements) {
    if (this.messages.length <= maxElements) {
      return;
    }

    // First, keep only the latest maxElements
    this.messages = this.messages.slice(-maxElements);
    
    // Then, ensure we have a user message at the start
    // Find the first user message
    let firstUserMessageIndex = -1;
    for (let i = 0; i < this.messages.length; i++) {
      if (this.messages[i].metadata.type === 'user_input') {
        firstUserMessageIndex = i;
        break;
      }
    }
    
    // If we didn't find a user message, or it's already at the start, nothing to do
    if (firstUserMessageIndex === -1 || firstUserMessageIndex === 0) {
      return;
    }
    
    // Otherwise, trim all messages before the first user message
    this.messages = this.messages.slice(firstUserMessageIndex);
  }

  /**
   * Serialize the conversation to an object
   * @returns {Object} The serialized conversation
   */
  serialize() {
    return {
      messages: this.messages
    };
  }

  /**
   * Deserialize the conversation from an object
   * @param {Object} data - The serialized conversation
   * @returns {Conversation} The deserialized conversation
   */
  deserialize(data) {
    if (data && data.messages) {
      this.messages = data.messages;
    }
    return this;
  }
} 