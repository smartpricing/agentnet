import { AgentLoaderJSON, Message, Bindings, MemoryStore } from "../../src/index.js"

const agentDefinition = {
    "apiVersion": "agentnet/v1alpha1",
    "kind": "AgentDefinition",
    "metadata": {
      "name": "accomodationAgent",
      "namespace": "smartchat"
    },
    "spec": {
      "store": {
        "type": "Memory",
      },
      "llm": {
        "provider": "GPT",
        "model": "gpt-4o-mini",
        "instructions": "You are a highly advanced accomodation manager agent. \nPrioritize clarity and helpfulness.\nUse tools effectively to gather information."
      },
      "tools": [
        {
          "name": "get_rooms_list_tool",
          "description": "Retrieves a list of available rooms based on criteria.",
          "type": "function",
          "parameters": {
            "type": "object",
            "properties": {
              "checkinDate": {
                "type": "string",
                "description": "The check-in date."
              },
              "checkoutDate": {
                "type": "string",
                "description": "The check-out date."
              },
              "guests": {
                "type": "integer",
                "description": "Number of guests."
              }
            },
            "required": [
              "checkinDate",
              "checkoutDate"
            ]
          }
        },
        {
          "name": "get_room_detail_tool",
          "description": "Retrieves detailed information about a specific room.",
          "type": "function",
          "parameters": {
            "type": "object",
            "properties": {
              "roomName": {
                "type": "string",
                "description": "The name of the room."
              }
            },
            "required": [
              "roomName"
            ]
          }
        }
      ]
    }
  }

// Load the agent definition
const agents = await AgentLoaderJSON(agentDefinition, {
    bindings: {
        [Bindings.Memory]: MemoryStore()
    }
})

// Add the binding tools to the agent
agents.accomodationAgent.tools.get_rooms_list_tool.bind(async (state, input) => {
    return { answer: "We have Double room with a view of the sea and a single room with a view of the pool, and a suite with a view of the city." }
})
agents.accomodationAgent.tools.get_room_detail_tool.bind(async (state, input) => {
    return { answer: "The Double room with a view of the sea has a king size bed, a private balcony, and a view of the sea." }
})

// Compile the agent
const agentInstance = await agents.accomodationAgent.compile()
const input = new Message("What rooms do you have from 2025-05-10 to 2025-05-15 for 2 guests?")

const input2 = new Message({
  content: "What rooms do you have from 2025-05-10 to 2025-05-15 for 2 guests?",
  session: {
    id: "67a71e42-a7d8-1db2-ad17-64e1c8546b21",
    propertySetId: "123"
  }
})


const result = await agentInstance.query(input2)

console.log(result.getContent())