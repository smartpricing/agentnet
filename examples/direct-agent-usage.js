import { Agent, GPT, Message, MemoryStore } from "../src/index.js"

// Example: Creating an agent directly without using AgentLoader
async function createAgentDirectly() {
    // Create a new agent using the Agent builder interface
    const agent = Agent()
        .setMetadata({
            name: "accomodationAgent",
            namespace: "smartchat",
            description: "A highly advanced accommodation manager agent"
        })
        .withLLM(GPT, {
            model: "gpt-4o-mini",
            instructions: "You are a highly advanced accommodation manager agent. \nPrioritize clarity and helpfulness.\nUse tools effectively to gather information."
        })
        .withStore(MemoryStore(), {
            type: "Memory"
        })
        .withRunner({
            maxRuns: 10,                    // Maximum number of LLM calls per query
            maxConversationLength: 10       // Maximum conversation history length
        })
        .addTool({
            name: "get_rooms_list_tool",
            description: "Retrieves a list of available rooms based on criteria.",
            type: "function",
            parameters: {
                type: "object",
                properties: {
                    checkinDate: {
                        type: "string",
                        description: "The check-in date."
                    },
                    checkoutDate: {
                        type: "string",
                        description: "The check-out date."
                    },
                    guests: {
                        type: "integer",
                        description: "Number of guests."
                    }
                },
                required: ["checkinDate", "checkoutDate"]
            }
        })
        .addTool({
            name: "get_room_detail_tool",
            description: "Retrieves detailed information about a specific room.",
            type: "function",
            parameters: {
                type: "object",
                properties: {
                    roomName: {
                        type: "string",
                        description: "The name of the room."
                    }
                },
                required: ["roomName"]
            }
        })
        .bindTool("get_rooms_list_tool", async (state, input) => {
            return { 
                answer: "We have Double room with a view of the sea and a single room with a view of the pool, and a suite with a view of the city." 
            }
        })
        .bindTool("get_room_detail_tool", async (state, input) => {
            return { 
                answer: "The Double room with a view of the sea has a king size bed, a private balcony, and a view of the sea." 
            }
        })
        // Optional: Add prompt handler
        .prompt(async (state, formattedInput) => {
            console.log("Processing prompt:", formattedInput)
            return formattedInput
        })
        // Optional: Add response handler
        .response(async (state, conversation, result) => {
            console.log("Generated response:", result)
            return result
        })

    // Compile the agent
    const agentInstance = await agent.compile()
    
    return agentInstance
}

// Usage example
async function main() {
    try {
        // Create the agent directly
        const agentInstance = await createAgentDirectly()
        
        // Create a message
        const input = new Message({
            content: "What rooms do you have from 2025-05-10 to 2025-05-15 for 2 guests?",
            session: {
                id: "67a71e42-a7d8-1db2-ad17-64e1c8546b21",
                propertySetId: "123"
            }
        })
        
        // Query the agent
        const result = await agentInstance.query(input)
        
        console.log("Agent response:", result.getContent())
        
    } catch (error) {
        console.error("Error:", error)
    }
}

// Run the example
main()
