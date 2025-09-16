# Direct Agent Usage

This document describes how to create agents directly using the Agent interface without using the AgentLoader.

## Overview

The Agent interface now provides all the necessary methods to create and configure agents programmatically without requiring YAML definitions or the AgentLoader. This gives you more flexibility and control when creating agents dynamically.

## New Methods Added

The following methods have been added to the Agent interface to enable direct agent creation:

### Tool Management

- **`addTool(toolDefinition, handlerFunction)`**: Adds a tool with its schema and optional handler function
  - `toolDefinition`: Object containing name, description, type, and parameters
  - `handlerFunction`: Optional function to handle tool execution

- **`bindTool(toolName, handlerFunction)`**: Binds a handler function to an existing tool
  - `toolName`: Name of the previously added tool
  - `handlerFunction`: Function to handle tool execution

### Event Handlers

- **`prompt(handler)`**: Sets the prompt preprocessing handler
  - `handler`: Function that receives (state, formattedInput) and returns modified input

- **`response(handler)`**: Sets the response postprocessing handler
  - `handler`: Function that receives (state, conversation, result) and returns modified result

### Configuration

- **`withRunner(runnerConfig)`**: Configures runner settings
  - `runnerConfig.maxRuns`: Maximum number of runs (default: 10)
  - `runnerConfig.maxConversationLength`: Maximum conversation length (default: 10)

## Example Usage

```javascript
import { Agent, GPT, Message, MemoryStore } from "agentnet"

// Create an agent directly without AgentLoader
const agent = Agent()
    .setMetadata({
        name: "myAgent",
        namespace: "myNamespace",
        description: "My custom agent"
    })
    .withLLM(GPT, {
        model: "gpt-4o-mini",
        instructions: "You are a helpful assistant."
    })
    .withStore(MemoryStore(), {
        type: "Memory"
    })
    .withRunner({
        maxRuns: 10,
        maxConversationLength: 10
    })
    .addTool({
        name: "my_tool",
        description: "Does something useful",
        type: "function",
        parameters: {
            type: "object",
            properties: {
                input: {
                    type: "string",
                    description: "The input parameter"
                }
            },
            required: ["input"]
        }
    })
    .bindTool("my_tool", async (state, input) => {
        // Tool implementation
        return { result: `Processed: ${input.input}` }
    })
    .prompt(async (state, formattedInput) => {
        // Optional: Preprocess the prompt
        console.log("Prompt:", formattedInput)
        return formattedInput
    })
    .response(async (state, conversation, result) => {
        // Optional: Postprocess the response
        console.log("Response:", result)
        return result
    })

// Compile the agent
const agentInstance = await agent.compile()

// Use the agent
const message = new Message("Hello, can you help me?")
const result = await agentInstance.query(message)
console.log(result.getContent())
```

## Method Chaining

All builder methods return the agent instance, allowing for fluent method chaining:

```javascript
const agent = Agent()
    .setMetadata({ name: "agent1", namespace: "ns1" })
    .withLLM(GPT, { model: "gpt-4" })
    .addTool(tool1)
    .addTool(tool2)
    .bindTool("tool1", handler1)
    .bindTool("tool2", handler2)
    .compile()
```

## Adding Tools with Handlers

You can add tools in two ways:

### 1. Add tool with handler in one call
```javascript
.addTool({
    name: "get_weather",
    description: "Gets weather information",
    type: "function",
    parameters: { /* ... */ }
}, async (state, input) => {
    // Handler implementation
    return { weather: "sunny" }
})
```

### 2. Add tool first, bind handler later
```javascript
.addTool({
    name: "get_weather",
    description: "Gets weather information",
    type: "function",
    parameters: { /* ... */ }
})
.bindTool("get_weather", async (state, input) => {
    // Handler implementation
    return { weather: "sunny" }
})
```

## Comparison with AgentLoader

### Using AgentLoader (YAML-based)
```javascript
const agents = await AgentLoaderFile("agents.yaml", { bindings })
agents.myAgent.tools.my_tool.bind(handler)
const instance = await agents.myAgent.compile()
```

### Using Direct Agent Interface
```javascript
const agent = Agent()
    .setMetadata({ name: "myAgent" })
    .withLLM(GPT, config)
    .addTool(toolDef, handler)
const instance = await agent.compile()
```

## Benefits of Direct Usage

1. **No YAML files required**: Create agents entirely in code
2. **Dynamic configuration**: Build agents based on runtime conditions
3. **Type safety**: Better IDE support and type checking
4. **Simpler testing**: Easier to unit test agent creation
5. **Flexibility**: Mix and match configurations programmatically

## Migration from AgentLoader

If you have existing YAML-based agents, you can migrate them to direct usage:

1. Extract the agent configuration from YAML
2. Convert each spec section to the corresponding method call
3. Add tools using `addTool()` instead of YAML tool definitions
4. Bind tool handlers using `bindTool()` or pass them directly to `addTool()`

## Error Handling

All methods include validation and will throw `ConfigurationError` if:
- Required parameters are missing
- Invalid types are provided
- Tools are bound before being added
- Invalid handler functions are provided

Example:
```javascript
try {
    const agent = Agent()
        .bindTool("nonexistent", handler) // Error: Tool not found
} catch (error) {
    console.error(error.message)
}
```

## Complete Example

See `examples/direct-agent-usage.js` for a complete working example of creating an accommodation booking agent using the direct Agent interface.
