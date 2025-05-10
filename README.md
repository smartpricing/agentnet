# Agentnet Framework

Agentnet is a flexible, extensible framework for building and orchestrating LLM-powered agents that can communicate, collaborate, and leverage tools to solve complex tasks. It is specifically designed to develop autonomous networks of agents that can work together to accomplish sophisticated objectives with minimal human intervention.

## Table of Contents

- [Declarative Agent Definitions](#declarative-agent-definitions)
  - [Static Definitions (YAML)](#static-definitions-yaml)
  - [Dynamic Implementation (JavaScript)](#dynamic-implementation-javascript)
  - [Multi-Agent Systems with YAML](#multi-agent-systems-with-yaml)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
  - [Agents](#agents)
  - [Agent Configuration](#agent-configuration)
  - [Tool Binding](#tool-binding)
  - [Transport Mechanisms](#transport-mechanisms)
  - [Agent Auto-Discovery](#agent-auto-discovery)
  - [Agent Handoffs](#agent-handoffs)
- [Advanced Usage](#advanced-usage)
  - [Events and Hooks](#events-and-hooks)
  - [Multi-Agent Systems](#multi-agent-systems)
  - [Session State Management](#session-state-management)
- [Installation](#installation)
- [License](#license)

## Declarative Agent Definitions

A key feature of Agentnet is the ability to define agents declaratively using YAML files, separating the static definition of agents from their dynamic runtime behavior:

### Static Definitions (YAML)

Agents can be defined in YAML files that specify:
- Metadata (name, description)
- LLM configuration (provider, model, system instructions)
- Transport mechanisms (NATS, etc.)
- Tool schemas (name, description, parameters)
- Discovery schemas for inter-agent communication

Example YAML definition:

```yaml
---
apiVersion: agentnet.io/v1alpha1
kind: AgentDefinition
metadata:
  name: bookingAgent
  namespace: smartchat
spec:
  io:
    - type: NatsIO
      bindings:
        discoveryTopic: smartness.discovery
        doHandoffsTo:
          - "smartness.accomodation.*"

  llm:
    provider: Gemini
    model: gemini-2.0-flash
    systemInstruction: |
      You are a highly advanced booking agent. 
      Prioritize clarity and helpfulness.
      Use tools effectively to gather information.
    config:
      temperature: 0.5
      toolConfig:
        functionCallingConfig:
          mode: 'auto'

  tools:
    - name: bookRoomTool
      description: Book a room to a specific hotel and room.
      parameters:
        type: object
        properties:
          hotelName:
            type: string
            description: The name of the hotel.
          roomName:
            type: string
            description: The name of the room.
          checkinDate:
            type: string
            description: The check-in date.
          checkoutDate:
            type: string
            description: The check-out date.
        required:
          - hotelName
          - roomName

  discoverySchemas:
    - name: booking_agent_query
      description: Perform a booking to a specific hotel and room.
      parameters:
        type: object
        properties:
          hotelName:
            type: string
            description: The name of the hotel.
          roomName:
            type: string
            description: The name of the room.
```

You can define multiple agents in a single YAML file using YAML document separators (`---`). Each agent can have its own specialized role in a multi-agent system.

### Dynamic Implementation (JavaScript)

The YAML definitions are loaded at runtime, and tool implementations are dynamically bound using JavaScript:

```javascript
// Load all agents from a YAML file
const agents = await AgentLoaderFile('./agents.yaml', {
  bindings: { [Bindings.NatsIO]: natsInstance }
});

// Access a specific agent
const bookingAgent = agents.bookingAgent;
const pricingAgent = agents.pricingAgent;

// Bind tool implementations
bookingAgent.tools.bookRoomTool.bind(async (state, input) => {
  // Actual implementation to book a room
  return { 
    confirmation: `Room ${input.roomName} booked at ${input.hotelName} 
                  from ${input.checkinDate} to ${input.checkoutDate}` 
  };
});

// Customize prompt/response handling
bookingAgent.prompt((state, input) => {
  // Pre-process input before sending to LLM
  console.log(`Received booking request: ${input}`);
  return input;
});

bookingAgent.response((state, conversation, result) => {
  // Post-process response from LLM
  return `Booking confirmation: ${result}`;
});

// Compile all agents to make them ready for use
await bookingAgent.compile();
await pricingAgent.compile();
```

This separation of concerns allows for:
- Version-controlled agent definitions
- Reusable tool schemas
- Dynamic runtime implementation
- Easy testing and deployment
- Clear separation between definition and implementation

### Multi-Agent Systems with YAML

The framework excels at creating autonomous multi-agent systems where specialized agents collaborate with minimal supervision. Each agent in the network can operate independently while maintaining awareness of other agents' capabilities. This creates a resilient, self-organizing system that can tackle complex tasks through agent collaboration. An example setup might include:

```javascript
// Load a set of specialized agents from YAML
const agents = await AgentLoaderFile('./agents-smartness.yaml', {
  bindings: { [Bindings.NatsIO]: natsIO }
});

// Configure each agent with specific tool implementations
agents.accomodationAgent.tools.getRoomsListTool.bind(async (state, input) => {
  // Implementation for listing available rooms
  return { rooms: ["Double room with sea view", "Single room with pool view"] };
});

agents.pricingAgent.tools.getPricingTool.bind(async (state, input) => {
  // Implementation for getting room prices
  return { price: "200€ per night" };
});

agents.bookingAgent.tools.bookRoomTool.bind(async (state, input) => {
  // Implementation for booking rooms
  return { confirmation: "Booking confirmed" };
});

// Compile all agents
await Promise.all(Object.values(agents).map(agent => agent.compile()));

// Wait for agent discovery to complete
await new Promise(resolve => setTimeout(resolve, 2000));

// Query the main orchestrator agent
const client = AgentClient();
const response = await client.queryIo(
  natsIO,
  'smartnessAgent', 
  "What rooms do you have available for next weekend and how much do they cost?"
);
```

With this setup, the smartness agent will automatically discover and delegate to specialized agents for accommodation, pricing, and booking, creating an autonomous network that collectively solves the user's query.

## Key Features

- **Autonomous Agent Networks**: Create self-organizing networks of agents that can discover, communicate, and collaborate with minimal human intervention
- **Modular Agent Architecture**: Create specialized agents with distinct capabilities and compose them to solve complex problems
- **Transport Agnostic**: Work with agents directly or through transport mechanisms like NATS
- **Auto-Discovery**: Agents can discover each other's capabilities dynamically at runtime
- **Tool Binding**: Easily bind JavaScript functions to agent tools
- **Agent Handoffs**: Seamlessly delegate tasks between agents
- **LLM Provider Agnostic**: Support for multiple LLM providers (Gemini and extensible to others)
- **Persistent Sessions**: Maintain conversation context and state across interactions

## Quick Start

```javascript
import { Agent, Gemini, NatsIO } from "agentnet";

// Create a simple agent
const myAgent = Agent()
  .setMetadata({
    name: "myAgent",
    description: "A helpful assistant"
  })
  .withLLM(Gemini, {
    model: "gemini-pro",
    systemInstruction: "You are a helpful assistant"
  })
  .addToolSchema({
    name: "weatherTool",
    description: "Get weather information",
    parameters: {
      location: "string"
    }
  });

// Bind tool implementation
const compiledAgent = await myAgent.compile();
compiledAgent.tools.weatherTool.bind(async (state, input) => {
  return { weather: "Sunny", temperature: 25 };
});

// Query the agent
const response = await compiledAgent.query("What's the weather like in Paris?");
console.log(response);
```

## Core Concepts

### Agents

Agents are the core building blocks of the framework. Each agent:

- Has its own identity (name, description)
- Can be configured with an LLM provider
- Can define and implement tools
- Can discover and communicate with other agents

### Agent Configuration

Agents can be configured programmatically or via YAML definitions:

```javascript
// Programmatic configuration
const myAgent = Agent()
  .setMetadata({ name: "myAgent" })
  .withLLM(Gemini, { model: "gemini-pro" })
  .addToolSchema(myToolSchema);

// YAML-based configuration
const agents = await AgentLoaderFile('./agents.yaml', {
  bindings: { [Bindings.NatsIO]: natsInstance }
});
```

### Tool Binding

Tools allow agents to perform actions in the real world. Each tool:

- Has a schema that defines its interface (name, description, parameters)
- Has an implementation bound to it at runtime

```javascript
// Define tool schema
agent.addToolSchema({
  name: "fetchData",
  description: "Fetch data from an API",
  parameters: {
    url: "string",
    method: "string"
  }
});

// Bind implementation
agent.tools.fetchData.bind(async (state, input) => {
  // Actual implementation
  const response = await fetch(input.url, { method: input.method });
  return await response.json();
});
```

### Transport Mechanisms

The framework supports different transport mechanisms for agent communication:

#### Direct Communication

Agents can be queried directly in the same process:

```javascript
const compiledAgent = await myAgent.compile();
const response = await compiledAgent.query("Hello, agent!");
```

#### NATS-based Communication

Agents can communicate through NATS for distributed deployments:

```javascript
// Initialize NATS transport
const natsIO = NatsIO({ servers: ['nats://localhost:4222'] });

// Configure agent with NATS transport
const myAgent = Agent()
  .setMetadata({ name: "distributedAgent" })
  .addIO(natsIO, { bindings: { discoveryTopic: "agent.discovery" } })
  .withLLM(Gemini, { model: "gemini-pro" });

// Query an agent through NATS
const client = AgentClient();
const response = await client.queryIo(natsIO, 'distributedAgent', "Hello!");
```

### Agent Auto-Discovery

Agents can discover each other's capabilities at runtime through a discovery protocol:

1. Agents publish their capabilities (available tools and schemas) to a discovery topic
2. Other agents subscribe to the discovery topic and build a catalog of available agents
3. Agents can then delegate tasks to the most appropriate agent

```javascript
// Auto-discovery happens automatically when agents share the same transport
// Just wait for discovery to complete
await new Promise(resolve => setTimeout(resolve, 2000));

// Now agents can communicate with each other
```

### Agent Handoffs

Agents can delegate tasks to other agents with the right capabilities:

1. An agent receives a task it can't handle directly
2. It identifies another agent with the required capability
3. It hands off the task to that agent
4. The specialized agent processes the task and returns the result

This happens transparently from the user's perspective, creating a seamless experience.

## Advanced Usage

### Events and Hooks

Customize agent behavior with event hooks:

```javascript
agent.prompt((state, input) => {
  // Customize input before it reaches the LLM
  return `[Processed] ${input}`;
});

agent.response((state, conversation, result) => {
  // Process the result before returning to the user
  return `Agent says: ${result}`;
});
```

### Multi-Agent Systems

Create autonomous networks of specialized agents that collaborate without human intervention:

```javascript
// Create specialized agents
const weatherAgent = Agent()
  .setMetadata({ name: "weatherAgent" })
  .addToolSchema(weatherToolSchema);

const travelAgent = Agent()
  .setMetadata({ name: "travelAgent" })
  .addToolSchema(travelToolSchema);

// The main agent that orchestrates others
const smartAgent = Agent()
  .setMetadata({ name: "smartAgent" })
  .addDiscoverySchema(weatherDiscoverySchema)
  .addDiscoverySchema(travelDiscoverySchema);

// Compile and connect all agents
await weatherAgent.compile();
await travelAgent.compile();
await smartAgent.compile();

// Query through the main agent
const response = await smartAgent.query(
  "Plan a trip to Paris and tell me about the weather"
);
```

In this autonomous network:
- Each agent is responsible for a specific domain of expertise
- The orchestrator agent (smartAgent) discovers and routes requests to appropriate specialists
- The network can scale by adding more specialized agents without changing existing ones
- Agents can be deployed across different environments while maintaining communication

### Session State Management

The Agentnet framework provides robust session management for maintaining state across conversations and agent interactions:

```javascript
// Creating a message with session information
const message = new Message({
  content: "What rooms do you have available?",
  session: {
    id: "67a71e42-a7d8-1db2-ad17-64e1c8546b21",  // Reserved system ID
    propertySetId: "123",                         // Custom session data
    userPreferences: { roomType: "suite" }        // Custom session data
  }
});

// Query the agent with session context
const result = await agentInstance.query(message);
```

#### Session ID

The `id` keyword in the session object is reserved for the system. It's used to uniquely identify the session for:
- Loading session state from persistent storage
- Saving session state back to storage
- Tracking conversation history

#### State Propagation

Session variables have different scopes:

1. **Regular variables** (without underscore prefix) are propagated between agents during handoffs, ensuring continuity of context across the agent system.

2. **Private variables** (with underscore prefix `_`) are agent-specific and not shared during handoffs. For example:
   ```javascript
   message.session._agentPrivateData = "This stays with the current agent";
   message.session.sharedData = "This is passed between agents";
   ```

When a session is saved to storage, private variables (starting with `_`) are saved on the agent store, but removed from response to the calling agent to keep the session data clean and focused on shareable information.

#### Stores Configuration

Agentnet supports different storage backends for persisting session state:

```javascript
// Configure the agent with a Postgres store
const agents = await AgentLoaderJSON(agentDefinition, {
  bindings: {
    [Bindings.Postgres]: PostgresStore({
      url: "postgres://postgres:postgres@localhost:5432/postgres"
    })
  }
});

// Or with an in-memory store for testing
const agents = await AgentLoaderJSON(agentDefinition, {
  bindings: {
    [Bindings.Memory]: MemoryStore()
  }
});
```

#### Session Life Cycle

1. When an agent receives a query with a session ID, it attempts to load the existing session state
2. The state is merged with any new session data provided in the query
3. The agent processes the query with access to this state
4. Before responding, the updated state is saved back to storage
5. Private variables (with `_` prefix) are removed from the response

This mechanism allows agents to maintain context across multiple interactions while keeping appropriate boundaries between agent-specific and shared data.

## Installation

```bash
npm install agentnet
```

