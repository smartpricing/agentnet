import { SmartAgent } from '../src/index.js';
import { AgentClient } from '../src/agent/client.js';
import { MemoryStore } from '../src/utils/store.js';

/**
 * Example demonstrating session management with SmartAgent
 */
async function main() {
    // Create a simple memory-based session store 
    const sessionStore = new MemoryStore();
    
    // Create an agent client with the session store
    const client = AgentClient({
        sessionStore
    });
    
    // Create a simple agent
    const agent = await SmartAgent({
        metadata: {
            name: 'session-demo'
        },
        llm: {
            provider: 'gpt',
            model: 'gpt-3.5-turbo'
        },
        tools: [
            {
                name: 'getCurrentTime',
                description: 'Gets the current time',
                execute: () => new Date().toLocaleTimeString()
            }
        ],
        on: {
            prompt: (state, input) => {
                console.log(`Processing input: ${input}`);
                // Update state with the current conversation turn
                state.turns = (state.turns || 0) + 1;
                return input;
            },
            response: (state, conversation, result) => {
                console.log(`State after processing: ${JSON.stringify(state)}`);
                return result;
            }
        }
    });
    
    // Start a conversation with a specific session ID
    const sessionId = 'user-123';
    
    // First query - should have empty state initially
    console.log('First query:');
    const response1 = await client.queryAgent(
        agent, 
        'What time is it?', 
        sessionId
    );
    console.log(`Response: ${response1}`);
    
    // Show the current session
    const session = await client.getSession(sessionId);
    console.log(`Session after first query: ${JSON.stringify(session)}`);
    
    // Second query - should maintain state from first query
    console.log('\nSecond query:');
    const response2 = await client.queryAgent(
        agent, 
        'Tell me what time it is again and remind me how many times I have asked', 
        sessionId
    );
    console.log(`Response: ${response2}`);
    
    // Show the updated session
    const updatedSession = await client.getSession(sessionId);
    console.log(`Session after second query: ${JSON.stringify(updatedSession)}`);
    
    // Clear the session
    console.log('\nClearing session');
    await client.clearSession(sessionId);
    
    // Start a new conversation session
    console.log('\nNew session:');
    const response3 = await client.queryAgent(
        agent, 
        'What time is it now?', 
        sessionId
    );
    console.log(`Response: ${response3}`);
    
    // Show the new session
    const newSession = await client.getSession(sessionId);
    console.log(`New session: ${JSON.stringify(newSession)}`);
}

// Run the example
main().catch(error => {
    console.error('Example failed:', error);
    process.exit(1);
}); 