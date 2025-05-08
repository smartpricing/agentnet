# SmartAgent Framework

SmartAgent is a flexible, extensible framework for building and orchestrating LLM-powered agents that can communicate, collaborate, and leverage tools to solve complex tasks.

## Declarative Agent Definitions

A key feature of SmartAgent is the ability to define agents declaratively using YAML files, separating the static definition of agents from their dynamic runtime behavior:

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
apiVersion: smartagent.io/v1alpha1
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

The framework excels at creating multi-agent systems where specialized agents collaborate. An example setup might include:

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

With this setup, the smartness agent will automatically discover and delegate to specialized agents for accommodation, pricing, and booking.

## Key Features

- **Modular Agent Architecture**: Create specialized agents with distinct capabilities and compose them to solve complex problems
- **Transport Agnostic**: Work with agents directly or through transport mechanisms like NATS
- **Auto-Discovery**: Agents can discover each other's capabilities dynamically at runtime
- **Tool Binding**: Easily bind JavaScript functions to agent tools
- **Agent Handoffs**: Seamlessly delegate tasks between agents
- **LLM Provider Agnostic**: Support for multiple LLM providers (Gemini and extensible to others)

## Quick Start

```javascript
import { Agent, Gemini, NatsIO } from "smartagent";

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

Create systems of specialized agents that collaborate:

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

## Installation

```bash
npm install smartagent
```

## License

[MIT License](LICENSE)
