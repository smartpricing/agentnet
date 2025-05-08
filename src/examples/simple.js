import { AgentLoaderJSON } from "../index.js"

const agentDefinition = {
    "apiVersion": "smartagent.io/v1alpha1",
    "kind": "AgentDefinition",
    "metadata": {
      "name": "accomodationAgent",
      "namespace": "smartchat"
    },
    "spec": {
      "llm": {
        "provider": "Gemini",
        "model": "gemini-2.0-flash",
        "systemInstruction": "You are a highly advanced accomodation manager agent. \nPrioritize clarity and helpfulness.\nUse tools effectively to gather information.\n",
        "config": {
          "temperature": 0.5,
          "toolConfig": {
            "functionCallingConfig": {
              "mode": "auto"
            }
          }
        }
      },
      "tools": [
        {
          "name": "getRoomsListTool",
          "description": "Retrieves a list of available rooms based on criteria.",
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
          "name": "getRoomDetailTool",
          "description": "Retrieves detailed information about a specific room.",
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
const agents = await AgentLoaderJSON(agentDefinition)

// Add the binding tools to the agent
agents.accomodationAgent.tools.getRoomsListTool.bind(async (state, input) => {
    return { answer: "We have Double room with a view of the sea and a single room with a view of the pool, and a suite with a view of the city." }
})
agents.accomodationAgent.tools.getRoomDetailTool.bind(async (state, input) => {
    return { answer: "The Double room with a view of the sea has a king size bed, a private balcony, and a view of the sea." }
})

// Compile the agent
const agentInstance = await agents.accomodationAgent.compile()

const result = await agentInstance.query("What rooms do you have from 2025-05-10 to 2025-05-15 for 2 guests?")

console.log(result)