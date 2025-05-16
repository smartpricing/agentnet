# Conversation Class

The `Conversation` class manages conversation history with additional metadata for each message. It provides an improved way to handle conversations compared to a plain array, allowing for more sophisticated conversation management, including proper trimming based on message types.

## Features

- Store messages with additional metadata (type, timestamp)
- Proper conversation trimming (e.g., keeping at least one user message)
- Support for different message types (user inputs, model responses, function calls)
- Easy serialization/deserialization
- Backward compatibility with existing code

## Usage

```javascript
import { Conversation } from 'smartagent';

// Create a new conversation
const conversation = new Conversation();

// Add messages
conversation.addUserMessage({
  role: 'user',
  content: 'Hello, how can you help me?'
});

conversation.addModelResponse({
  role: 'assistant',
  content: 'I can help with many tasks. What do you need?'
});

// Get raw conversation for LLM APIs
const rawConversation = conversation.getRawConversation();

// Get all messages with metadata
const allMessages = conversation.getMessages();

// Trim conversation while ensuring it starts with a user message
conversation.trim(10);

// Import from existing array
conversation.importFromArray(existingArray);

// Serialize/deserialize
const serialized = conversation.serialize();
conversation.deserialize(serialized);
```

## Integration with SessionStore

The `SessionStore` class has been updated to use the `Conversation` class internally:

```javascript
import { SessionStore } from 'smartagent';

const sessionStore = new SessionStore('session-id');

// Load the conversation
await sessionStore.load(store);

// Get the conversation manager
const conversationManager = sessionStore.getConversationManager();

// Add a message
conversationManager.addUserMessage({ /* message */ });

// Trim with proper handling
sessionStore.trimConversation(10);

// Save conversation
await sessionStore.dump(store);
```

## Message Types

The Conversation class tracks different message types:

- `user_input`: Messages from the user
- `model_response`: Responses from the LLM model
- `function_call`: Function/tool calls from the model
- `function_result`: Results of function/tool calls

## Compatibility

The implementation maintains backward compatibility with existing code that uses plain arrays for conversations. The LLM implementations (`GeminiLLM` and `OpenAILLM`) have been updated to properly handle both plain arrays and `Conversation` objects.

## Benefits

- **Better trimming**: Trimming maintains conversation context by ensuring at least one user message remains
- **Type awareness**: Messages are tracked by type, making it easier to understand the conversation flow
- **Metadata**: Additional information can be stored with each message
- **Serialization**: Easy serialization and deserialization for storage 