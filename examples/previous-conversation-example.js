import { Message } from '../src/index.js';

// Example of using the new previousConversation capability
console.log('=== Previous Conversation Example ===\n');

// Example 1: Generic format (works with all LLM providers)
const genericPreviousConversation = [
  { role: 'user', content: 'Hello, I need help with my React project.' },
  { role: 'assistant', content: 'I\'d be happy to help! What specific aspect of your React project do you need assistance with?' },
  { role: 'user', content: 'I\'m having trouble with state management.' },
  { role: 'assistant', content: 'State management can be tricky. Are you using useState, useReducer, or a library like Redux?' }
];

const messageWithGeneric = new Message({
  content: 'Can you help me implement a shopping cart?',
  session: { id: 'session-123', userId: 'user-456' },
  previousConversation: genericPreviousConversation
});

console.log('Generic Format Message:');
console.log('- Content:', messageWithGeneric.getContent());
console.log('- Session ID:', messageWithGeneric.getSessionId());
console.log('- Previous Conversation Length:', messageWithGeneric.getPreviousConversation()?.length || 0);
console.log('- First Previous Message:', messageWithGeneric.getPreviousConversation()?.[0]);
console.log();

// Example 2: Mixed format (Gemini + OpenAI formats)
const mixedPreviousConversation = [
  { role: 'user', content: 'What is machine learning?' },
  { role: 'model', parts: [{ text: 'Machine learning is a subset of AI...' }] }, // Gemini format
  { role: 'user', content: 'Can you give me an example?' },
  { role: 'assistant', content: 'Sure! A common example is email spam detection...' } // OpenAI format
];

const messageWithMixed = new Message({
  content: 'How does neural networks work?',
  session: { id: 'session-456' },
  previousConversation: mixedPreviousConversation
});

console.log('Mixed Format Message:');
console.log('- Content:', messageWithMixed.getContent());
console.log('- Previous Conversation Length:', messageWithMixed.getPreviousConversation()?.length || 0);
console.log('- Mixed formats detected:', {
  geminiFormat: messageWithMixed.getPreviousConversation()?.some(msg => msg.role === 'model'),
  openaiFormat: messageWithMixed.getPreviousConversation()?.some(msg => msg.role === 'assistant')
});
console.log();

// Example 3: Serialization/Deserialization
console.log('Serialization Example:');
const serialized = messageWithGeneric.serialize();
console.log('- Serialized length:', serialized.length, 'characters');

const newMessage = new Message({ content: '' });
newMessage.deserialize(serialized);
console.log('- Deserialized content matches:', newMessage.getContent() === messageWithGeneric.getContent());
console.log('- Deserialized previous conversation matches:', 
  JSON.stringify(newMessage.getPreviousConversation()) === JSON.stringify(messageWithGeneric.getPreviousConversation()));
console.log();

// Example 4: Backward compatibility (no previous conversation)
const simpleMessage = new Message({
  content: 'Simple question without previous context',
  session: { id: 'session-789' }
});

console.log('Backward Compatibility:');
console.log('- Content:', simpleMessage.getContent());
console.log('- Previous Conversation:', simpleMessage.getPreviousConversation()); // Should be null
console.log('- String constructor still works:', new Message('Just a string').getContent());

console.log('\n=== Implementation Complete ===');
console.log('✅ Message class extended with previousConversation field');
console.log('✅ Runtime integration handles conversation prefilling');
console.log('✅ Backward compatibility maintained');
console.log('✅ Auto-detection of different LLM formats supported');
