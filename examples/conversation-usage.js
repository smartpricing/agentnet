import { Conversation, SessionStore } from '../src/index.js';
import { MemoryStore } from '../src/utils/store.js';

// Example of using the Conversation class
async function conversationExample() {
  // Create a new conversation
  const conversation = new Conversation();

  // Add user and model messages
  conversation.addUserMessage({
    role: 'user',
    content: 'Hello, I need help with my project.'
  });

  conversation.addModelResponse({
    role: 'assistant',
    content: 'I\'d be happy to help! What kind of project are you working on?'
  });

  // Get the raw conversation (format needed by LLMs)
  const rawConversation = conversation.getRawConversation();
  console.log('Raw conversation:', JSON.stringify(rawConversation, null, 2));

  // Get full messages with metadata
  const messages = conversation.getMessages();
  console.log('Messages with metadata:', JSON.stringify(messages, null, 2));

  // Trim the conversation
  conversation.trim(5);
  console.log('After trimming:', JSON.stringify(conversation.getMessages(), null, 2));

  // Import from existing array
  const existingConversation = [
    { role: 'user', content: 'What is the weather today?' },
    { role: 'assistant', content: 'I don\'t have access to real-time weather data.' },
    { role: 'user', content: 'Can you help me with coding instead?' }
  ];

  conversation.importFromArray(existingConversation);
  console.log('After importing:', JSON.stringify(conversation.getRawConversation(), null, 2));

  // SessionStore example
  const sessionStore = new SessionStore('example-session');
  const store = new MemoryStore();

  // Set conversation and state
  sessionStore.setConversation(conversation);
  sessionStore.setState({ userId: '12345', lastActivity: new Date().toISOString() });

  // Trim conversation to keep only the latest 2 messages
  sessionStore.trimConversation(2);
  console.log('After trimming in SessionStore:', 
    JSON.stringify(sessionStore.getConversation(), null, 2));

  // Save to store
  await sessionStore.dump(store);

  // Load from store
  const newSessionStore = new SessionStore('example-session');
  await newSessionStore.load(store);

  console.log('Loaded conversation:', 
    JSON.stringify(newSessionStore.getConversation(), null, 2));
  console.log('Loaded state:', 
    JSON.stringify(newSessionStore.getState(), null, 2));
}

conversationExample().catch(console.error); 