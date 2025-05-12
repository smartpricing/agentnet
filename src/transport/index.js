/**
 * Transport Factory Module
 * Provides a unified interface to create transport instances
 */
import { Transport } from './base.js';
import { createNatsTransport, NatsIOAgentRuntime } from './nats.js';
import { createKafkaTransport, KafkaIOAgentRuntime } from './kafka.js';
import { createRedisTransport, RedisIOAgentRuntime } from './redis.js';
import { createRabbitMQTransport, RabbitMQIOAgentRuntime } from './rabbitmq.js';
import { TransportError } from '../errors/index.js';
import { logger } from '../utils/logger.js';

// Map of transport types to their factory functions
const transportFactories = {
    'nats': createNatsTransport,
    'kafka': createKafkaTransport,
    'redis': createRedisTransport,
    'rabbitmq': createRabbitMQTransport,
};

// Map of transport types to their runtime functions
const runtimeFactories = {
    'nats': NatsIOAgentRuntime,
    'kafka': KafkaIOAgentRuntime,
    'redis': RedisIOAgentRuntime,
    'rabbitmq': RabbitMQIOAgentRuntime,
};

/**
 * Create a transport instance based on the specified type
 * @param {string} type - The transport type (e.g., 'nats', 'kafka', 'redis', 'rabbitmq')
 * @returns {Transport} - A transport instance
 * @throws {TransportError} - If the transport type is not supported
 */
export function createTransport(type) {
    const factoryFn = transportFactories[type.toLowerCase()];
    
    if (!factoryFn) {
        throw new TransportError(
            `Unsupported transport type: ${type}`,
            'TransportFactory',
            { supportedTypes: Object.keys(transportFactories) }
        );
    }
    
    return factoryFn();
}

/**
 * Create a transport runtime for an agent
 * @param {string} type - The transport type (e.g., 'nats', 'kafka', 'redis', 'rabbitmq')
 * @param {string} namespace - The agent namespace
 * @param {string} agentName - The agent name
 * @param {Array} ioInterfaces - The IO interfaces
 * @param {Array} discoverySchemas - The agent capability schemas for discovery
 * @returns {Promise<Object>} - The runtime { handleTask, discoveredAgents }
 * @throws {TransportError} - If the transport type is not supported
 */
export async function createAgentRuntime(type, namespace, agentName, ioInterfaces, discoverySchemas) {
    const runtimeFn = runtimeFactories[type.toLowerCase()];
    
    if (!runtimeFn) {
        throw new TransportError(
            `Unsupported transport runtime type: ${type}`,
            'TransportFactory',
            { supportedTypes: Object.keys(runtimeFactories) }
        );
    }
    
    try {
        return await runtimeFn(namespace, agentName, ioInterfaces, discoverySchemas);
    } catch (error) {
        logger.error(`Failed to create ${type} agent runtime`, { error, agentName });
        throw error;
    }
}

/**
 * Export base classes and interfaces for extensibility
 */
export * from './base.js';

/**
 * Export specific transport implementations
 */
export * from './nats.js';
export * from './kafka.js';
export * from './redis.js';
export * from './rabbitmq.js'; 