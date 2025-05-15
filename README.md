# Agentnet

## Table of Contents

- [Introduction](#introduction)
- [Installation](#installation)
- [API Keys Configuration](#api-keys-configuration)
- [Super Simple Example (Quick Start)](#super-simple-example-quick-start)
- [Declarative Agent Definitions (YAML & JavaScript)](#declarative-agent-definitions-yaml--javascript)
- [State Management](#state-management)
- [Network Topologies & Filtering](#network-topologies--filtering)
- [Available LLMs, Stores, and IO](#available-llms-stores-and-io)
- [Direct Access to Agent Fluent Interface](#direct-access-to-agent-fluent-interface)
- [Examples](#examples)


## Introduction

Agentnet empowers you to build sophisticated autonomous systems by creating and connecting intelligent agents. These agents can be defined statically for clear, version-controlled structures, or dynamically for flexible runtime behaviors. Agentnet facilitates the creation of powerful network meshes where agents can collaborate seamlessly.

Key aspects include:
*   **Static & Dynamic Definitions**: Define agents using YAML for a declarative approach, or implement them dynamically with JavaScript for ultimate flexibility. This separation allows for clear versioning of agent capabilities while enabling dynamic runtime bindings and behaviors.
*   **Network Meshes & Auto-Discovery**: Agents can operate within complex network topologies, automatically discovering each other's capabilities. This enables them to form ad-hoc collaborations to solve tasks that a single agent could not.
*   **Transport Agnostic**: Agentnet supports various transport mechanisms, like NATS for distributed systems or direct in-process communication, allowing you to choose the best fit for your deployment.
*   **State Management & Stores**: Robust session state management ensures context is maintained across interactions. Agentnet supports multiple storage backends (e.g., Postgres, Redis, In-Memory) for persisting agent and session data.

## Key Features

*   **Autonomous Agent Networks**: Design self-organizing networks where agents discover, communicate, and collaborate with minimal human intervention.
*   **Modular Agent Architecture**: Build specialized agents with distinct capabilities and compose them to tackle complex problems.
*   **Declarative & Programmatic Definitions**: Define agents using YAML or configure them programmatically with a fluent JavaScript API.
*   **Flexible Tool Binding**: Easily bind JavaScript functions to agent tools, enabling them to interact with external systems and data.
*   **Agent Handoffs**: Seamlessly delegate tasks between agents based on their expertise.
*   **LLM Provider Agnostic**: Supports multiple LLM providers (e.g., Gemini, OpenAI GPT) and is extensible.
*   **Persistent Sessions**: Maintain conversation context and state across multiple interactions using configurable storage backends.
*   **Network Filtering**: Control agent communication with powerful wildcard-based network filtering for enhanced security and efficiency.


## Installation

```bash
npm install agentnet
```

## API Keys Configuration

Agentnet requires API keys for accessing the LLM providers you plan to use. The keys should be set as environment variables:

- **Gemini**: Set `GEMINI_API_KEY` for using Google's Gemini models
- **OpenAI**: Set `OPENAI_API_KEY` for using OpenAI's GPT models

You can set these environment variables in your deployment environment or use a `.env` file with a package like `dotenv`:

```javascript
// In your main file, before importing agentnet
import dotenv from 'dotenv';
dotenv.config();

// Now the API keys are available to agentnet
import { Agent, Gemini } from "agentnet";
```

Example `.env` file:
```
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

> Note: If you try to use an LLM provider without setting the corresponding API key, Agentnet will throw an error indicating which environment variable is missing.

## Super Simple Example (Quick Start)

Here's how you can quickly get an agent up and running:

```javascript
import { Agent, Gemini } from "agentnet"; // Assuming Gemini is configured

// Create a simple agent
const myAgent = Agent()
  .setMetadata({
    name: "myAgent",
    description: "A helpful assistant"
  })
  .withLLM(Gemini, { // Or use LLMRuntime.GPT for OpenAI
    model: "gemini-pro", // Replace with your desired model
    systemInstruction: "You are a helpful assistant"
  })
  .addToolSchema({
    name: "weatherTool",
    description: "Get weather information",
    parameters: { // Simplified for brevity; use JSON schema for complex types
      location: "string"
    }
  });

// Compile the agent and bind tool implementation
const compiledAgent = await myAgent.compile();
compiledAgent.tools.weatherTool.bind(async (state, input) => {
  // Actual implementation to get weather
  return { weather: "Sunny", temperature: 25, location: input.location };
});

// Query the agent
const response = await compiledAgent.query("What's the weather like in Paris?");
console.log(response.getContent()); // Access the agent's response content
```

## Declarative Agent Definitions (YAML & JavaScript)

Agentnet shines with its ability to separate static agent definitions (YAML) from dynamic runtime behavior (JavaScript).

### Static Definitions (YAML)

Define agent metadata, LLM configurations, transport, tools, and discovery schemas in YAML:

```yaml
---
apiVersion: agentnet/v1alpha1
kind: AgentDefinition
metadata:
  name: bookingAgent
  namespace: smartchat
spec:
  io: # Transport and network configuration
    - type: NatsIO
      bindings:
        discoveryTopic: "smartness.discovery"
        acceptedNetworks:
          - "smartchat.*" # Accepts messages from any agent in the 'smartchat' namespace

  llm:
    provider: Gemini # Or GPT
    model: gemini-1.5-flash # Example model
    systemInstruction: |
      You are a highly advanced booking agent.
      Prioritize clarity and helpfulness.
    config: # This is the native config of the npm driver (genai, openai)
      temperature: 0.5
      # Tool configuration specific to the LLM provider
      toolConfig:
        functionCallingConfig:
          mode: 'auto' # For Gemini

  tools: # This is the native config of the npm driver (genai, openai) for tools
    - name: bookRoomTool
      description: Book a room at a specific hotel.
      parameters: # JSON Schema for tool parameters
        type: object
        properties:
          hotelName: { type: string, description: "The name of the hotel." }
          roomName: { type: string, description: "The name of the room." }
          # ... other parameters
        required: [hotelName, roomName]

  discoverySchemas: # Capabilities this agent wants to discover from others
    - name: pricing_query
      description: Get pricing information for a room.
      # parameters schema for the discovery...
```

### API Versioning

Agentnet supports API versioning to maintain backwards compatibility while evolving the platform:

```yaml
apiVersion: agentnet/v1alpha1  # Specify which API version this definition uses
```

Currently supported API versions:

- `agentnet/v1alpha1`: Current API version

When creating agent definitions, you should specify which API version you're targeting. This allows Agentnet to:

1. Apply the correct validation rules
2. Handle differences in configuration format
3. Maintain backward compatibility with older definitions
4. Enable new features only available in newer versions

If you don't specify an `apiVersion`, Agentnet will default to `agentnet/v1alpha1` but will log a warning.


### Dynamic Implementation (JavaScript)

Load YAML definitions and bind tool implementations dynamically:

```javascript
import { AgentLoaderFile, NatsIO, Bindings } from "agentnet";

// NatsIO instance (example)
const natsInstance = NatsIO({ servers: ['nats://localhost:4222'] });

// Load agents from YAML
const agents = await AgentLoaderFile('./agents.yaml', {
  bindings: { [Bindings.NatsIO]: natsInstance } // Provide necessary bindings
});

const bookingAgent = agents.bookingAgent;

// Bind tool implementations
bookingAgent.tools.bookRoomTool.bind(async (state, input) => {
  console.log(`Booking room: ${input.roomName} at ${input.hotelName}`);
  // ... actual booking logic ...
  return { confirmation: `Room ${input.roomName} booked at ${input.hotelName}.` };
});

// Compile the agent to make it ready
await bookingAgent.compile();
```

## State Management

Agentnet provides robust session management for maintaining state across conversations and agent interactions.

When an agent receives a query, it can load existing session state. This state is merged with any new session data from the query. After processing, the updated state is saved back.

```javascript
// Example: Querying an agent with session data
import { Message, AgentClient, NatsIO } from "agentnet"; // Added AgentClient and NatsIO for context

const client = AgentClient(); // Assuming you have an AgentClient instance
const natsIO = NatsIO({ servers: ['nats://localhost:4222'] }); // Example NatsIO

// Example: Loading and compiling agents
const agents = await AgentLoaderFile('./hotel-agents.yaml', {
  bindings: { 
    [Bindings.NatsIO]: natsIO,
    [Bindings.Postgres]: PostgresStore({ url: "postgres://user:pass@host:port/db" })
  }
});

// Access individual agents
const bookingAgent = agents.bookingAgent;
const pricingAgent = agents.pricingAgent;

// Bind tool implementations
bookingAgent.tools.bookRoomTool.bind(async (state, input) => {
  // Implementation for booking tool
  return { success: true, bookingId: "BK12345" };
});

pricingAgent.tools.getPricingTool.bind(async (state, input) => {
  // Implementation for pricing tool
  state._privatePricingVariable = { done: true }
  return { price: 200, currency: "EUR", perNight: true };
});

// Compile all agents to make them ready
console.log("Compiling agents...");
await Promise.all(Object.values(agents).map(agent => agent.compile()));

// Wait for agent discovery to complete
console.log("Waiting for agent discovery...");
await new Promise(resolve => setTimeout(resolve, 2000));

console.log("Agent network ready!");


const message = new Message({
  content: "What rooms do you have available for next weekend?",
  session: {
    id: "session_123_user_abc", // Unique session identifier
    userPreferences: { roomType: "suite", view: "sea" },
    _internalCounter: 0 // Private agent variable, not propagated
  }
});

// Query the agent using the client
console.log("Sending query to the entrypoint agent...");
const response = await client.queryIo(natsIO, 'smartchat.entrypointAgent', message); // {namespace}.{name}

// Process the response
console.log("Agent Response:", response.getContent());

// Access the updated session data (private variables like _internalCounter are excluded)
const updatedSession = response.getSession();
console.log("Updated Session:", updatedSession);

```

*   **Session ID**: A unique `id` in the session object is used for loading/saving state and tracking conversation history.
*   **State Propagation**:
    *   Regular session variables (e.g., `userPreferences`) are propagated between agents during handoffs.
    *   Private variables (prefixed with `_`, e.g., `_internalCounter`) are agent-specific and not shared. They are saved with the agent's state but removed from the response to the calling agent/client.
*   **Stores Configuration**: Configure persistent storage for session state.
    ```javascript
    import { AgentLoaderFile, PostgresStore, RedisStore, MemoryStore, Bindings } from "agentnet";

    const agents = await AgentLoaderFile('./agents.yaml', {
      bindings: {
        // [Bindings.NatsIO]: natsInstance, // If using NATS
        [Bindings.Postgres]: PostgresStore({ url: "postgres://user:pass@host:port/db" }),
        // [Bindings.Redis]: RedisStore({ url: "redis://host:port" }),
        // [Bindings.Memory]: MemoryStore() // For testing or simple cases
      }
    });
    ```
    Agent definitions in YAML can specify which store to use if multiple are bound.

## Network Topologies & Filtering

Agentnet enables complex multi-agent systems where specialized agents collaborate.

Agentnet supports complex network topologies where agents can discover and communicate with each other based on their capabilities and network configurations.

![Agent Network Topology](assets/network01.png)

The diagram above illustrates how agents can be organized in a network, with different communication patterns and discovery mechanisms.


### Agent Auto-Discovery & Handoffs
Agents can publish their capabilities (tools and discovery schemas) and subscribe to discover others. This allows an orchestrator agent, for example, to delegate tasks to the most appropriate specialist agent. This handoff happens transparently.

### Network Filtering
Control inter-agent communication using `acceptedNetworks` in the agent's I/O configuration. This uses wildcard patterns for fine-grained control:

```yaml
# In agent_definition.yaml
# ...
spec:
  io:
    - type: NatsIO
      bindings:
        discoveryTopic: "smartness.discovery"
        acceptedNetworks:
          - "smartchat.*"     # Accept all services in 'smartchat' namespace
          - "finance.pricing" # Accept only 'pricing' service in 'finance' namespace
          - "*.analytics"     # Accept 'analytics' services from any namespace
          - "*.*"             # Accept all networks (use with caution)
# ...
```
Agents will only process discovery messages and requests from networks matching their acceptance patterns. The `network` field (e.g., `smartchat.orchestrator`) defines the agent's own address on the network.

In Agentnet, each agent is uniquely identified by a combination of its namespace and name, formatted as `namespace.name`. This identifier serves as the agent's address on the network.


## Available LLMs, Stores, and IO

*   **LLM Providers**:
    *   **Gemini**: Google's Gemini models.
    *   **OpenAI GPT**: OpenAI's GPT models.
    *   Easily extensible to other providers.
*   **Stores**:
    *   **PostgresStore**: Persist session state in PostgreSQL.
    *   **RedisStore**: Use Redis for session state.
    *   **MemoryStore**: In-memory store, useful for testing or simple applications.
*   **IO (Transport)**:
    *   **NatsIO**: For asynchronous, distributed agent communication using NATS.
    *   **Direct Call**: Agents can be invoked directly within the same process.

## Direct Access to Agent Fluent Interface

Besides YAML, you can define and configure agents programmatically using a fluent JavaScript API. This offers fine-grained control and is great for dynamic setups or testing.

```javascript
import { Agent, Gemini, NatsIO } from "agentnet";

const natsIO = NatsIO({ servers: ['nats://localhost:4222'] }); // Example

const travelAgent = Agent()
  .setMetadata({
    name: "travelAgent",
    namespace: "trips",
    description: "Helps plan travels"
  })
  .withLLM(Gemini, {
    model: "gemini-pro",
    systemInstruction: "You are a travel planning assistant."
  })
  .addIO(natsIO, { // Configure NATS IO
    network: "trips.travelAgent",
    bindings: {
        discoveryTopic: "global.discovery",
        acceptedNetworks: ["trips.*", "common.weather"]
    }
  })
  .addToolSchema({
    name: "findFlightsTool",
    description: "Find flights for given criteria.",
    parameters: { /* ... schema ... */ }
  })
  .addDiscoverySchema({ // What this agent wants to discover
    name: "weather_service_lookup",
    description: "Finds an agent that can provide weather information.",
    parameters:  { /* ... schema ... */ }
  });

// Bind implementation for its own tool
travelAgent.tools.findFlightsTool.bind(async (state, input) => {
  // ... logic to find flights ...
  return { flights: [/* ... flight data ... */] };
});

// Optional: Add prompt/response hooks
travelAgent.prompt((state, input) => {
  console.log(`Travel agent received prompt: ${input}`);
  return `Plan this trip: ${input}`; // Modify input to LLM
});

travelAgent.response((state, conversation, result) => {
  console.log(`Travel agent sending response: ${result}`);
  return `Your travel plan: ${result}`; // Modify output from LLM
});

// Compile the agent
const compiledTravelAgent = await travelAgent.compile();

// The agent will now connect to NATS, announce itself, and start discovering others.
// It can also be queried directly if not solely NATS-based or for testing:
// const response = await compiledTravelAgent.query("Find me a flight to Bali.");
// console.log(response.getContent());
```

## Examples

*   **Simple Agent Example**: For beginners, the [`examples/simple/README.md`](https://github.com/smartpricing/agentnet/blob/master/examples/simple/README.md) provides a minimal implementation of an accommodation agent, perfect for understanding the basic concepts of agent definition and tool binding.

*   **Booking Example**: See a multi-agent system in action for a smart booking scenario in [`examples/smartness/README.md`](https://github.com/smartpricing/agentnet/blob/master/examples/smartness/README.md). This demonstrates concepts like agent discovery, handoffs, and tool usage in a practical setup.

*   **Customer Support Example**: Explore a customer support system with specialized agents for different support domains in [`examples/customer-support/README.md`](https://github.com/smartpricing/agentnet/blob/master/examples/customer-support/README.md). This shows how agents can collaborate to resolve complex customer inquiries.

*   **Event Planner Example**: Check out the event planning system in [`examples/event-planner/README.md`](https://github.com/smartpricing/agentnet/blob/master/examples/event-planner/README.md) that demonstrates how agents can coordinate to manage calendars, find suitable time slots, and handle event scheduling.
