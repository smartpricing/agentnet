# Transport Module

This module provides a common interface for different messaging transports used in the agent communication system.

## Architecture

The transport module follows an abstract factory pattern with the following components:

- **Transport Interface**: A base class that defines common methods for all transports
- **TransportMessage**: A base class for messages exchanged between agents
- **DiscoveryMessage**: A specialized message class for agent capability discovery
- **Concrete Implementations**: Implementations of the Transport interface for different messaging systems

## Supported Transports

- NATS
- Kafka (template implementation)
- Redis (template implementation)
- RabbitMQ (template implementation)

## Usage

### Creating a Transport

```javascript
import { createTransport } from './transport/index.js';

// Create a specific transport
const natsTransport = createTransport('nats');
const kafkaTransport = createTransport('kafka');
const redisTransport = createTransport('redis');
const rabbitMqTransport = createTransport('rabbitmq');

// Connect to the messaging system
await natsTransport.connect(config);
```

### Creating an Agent Runtime

```javascript
import { createAgentRuntime } from './transport/index.js';

// Create a runtime for an agent with a specific transport
const runtime = await createAgentRuntime('nats', namespace, agentName, ioInterfaces, discoverySchemas);

// Use the runtime to handle tasks
await runtime.handleTask(async (message) => {
  // Process the task
  return responseMessage;
});

// Access discovered agents
const discoveredAgents = runtime.discoveredAgents;
```

### Using the Transport Directly

```javascript
import { createTransport } from './transport/index.js';

// Create and connect a transport
const transport = createTransport('nats');
await transport.connect(config);

// Publish a message
await transport.publish('topic', message);

// Subscribe to a topic
await transport.subscribe('topic', handleMessage);

// Send a request and wait for a response
const response = await transport.request('target', message);
```

## Extending with New Transports

To add a new transport:

1. Create a new file (e.g., `myTransport.js`) that implements the Transport interface
2. Create a factory function that returns a new instance of your transport
3. Register the factory in the `transportFactories` map in `index.js`
4. Create a runtime function and register it in the `runtimeFactories` map

Example:

```javascript
// myTransport.js
import { Transport } from './base.js';

export class MyTransport extends Transport {
  // Implement all required methods
}

export function createMyTransport() {
  return new MyTransport();
}

export async function MyTransportIOAgentRuntime(namespace, agentName, ioInterfaces, discoverySchemas) {
  // Implementation
}

// index.js - update the factory maps
const transportFactories = {
  // ...existing transports
  'mytransport': createMyTransport
};

const runtimeFactories = {
  // ...existing runtimes
  'mytransport': MyTransportIOAgentRuntime
};
```

## Common Interface

All transports must implement these key methods:

- `connect(config)`: Connect to the messaging system
- `disconnect()`: Disconnect from the messaging system
- `publish(topic, message)`: Publish a message to a topic
- `subscribe(topic, options)`: Subscribe to a topic
- `request(target, message, options)`: Send a request and wait for a response
- `createRuntime(namespace, agentName, discoverySchemas, config)`: Create a runtime for agent communication 