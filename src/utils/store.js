import { logger } from './logger.js';

/**
 * Base store interface
 */
class Store {
    /**
     * Gets a value by key
     * @param {string} key - The key to get
     * @returns {Promise<string>} The value
     */
    async get(key) {
        throw new Error('Method not implemented');
    }
    
    /**
     * Sets a key to a value
     * @param {string} key - The key to set
     * @param {string} value - The value to set
     * @returns {Promise<void>}
     */
    async set(key, value) {
        throw new Error('Method not implemented');
    }
    
    /**
     * Deletes a key
     * @param {string} key - The key to delete
     * @returns {Promise<boolean>} Whether the key was deleted
     */
    async delete(key) {
        throw new Error('Method not implemented');
    }
}

/**
 * In-memory store implementation
 */
export class MemoryStore extends Store {
    constructor() {
        super();
        this.store = new Map();
        logger.debug('Initialized in-memory store');
    }
    
    /**
     * Gets a value by key
     * @param {string} key - The key to get
     * @returns {Promise<string>} The value
     */
    async get(key) {
        logger.debug(`MemoryStore: Getting key ${key}`);
        return this.store.get(key);
    }
    
    /**
     * Sets a key to a value
     * @param {string} key - The key to set
     * @param {string} value - The value to set
     * @returns {Promise<void>}
     */
    async set(key, value) {
        logger.debug(`MemoryStore: Setting key ${key}`);
        this.store.set(key, value);
    }
    
    /**
     * Deletes a key
     * @param {string} key - The key to delete
     * @returns {Promise<boolean>} Whether the key was deleted
     */
    async delete(key) {
        logger.debug(`MemoryStore: Deleting key ${key}`);
        return this.store.delete(key);
    }
    
    /**
     * Gets all keys
     * @returns {Promise<Array<string>>} All keys in the store
     */
    async keys() {
        return Array.from(this.store.keys());
    }
    
    /**
     * Clears the store
     * @returns {Promise<void>}
     */
    async clear() {
        logger.debug('MemoryStore: Clearing all keys');
        this.store.clear();
    }
}

/**
 * Redis store implementation
 */
export class RedisStore extends Store {
    /**
     * Creates a new Redis store
     * @param {Object} client - Redis client
     * @param {Object} options - Store options
     * @param {string} options.prefix - Key prefix
     * @param {number} options.ttl - Time to live in seconds
     */
    constructor(client, options = {}) {
        super();
        this.client = client;
        this.prefix = options.prefix || 'smartagent:session:';
        this.ttl = options.ttl || 86400; // 24 hours default
        logger.debug('Initialized Redis store', { prefix: this.prefix, ttl: this.ttl });
    }
    
    /**
     * Gets the full key with prefix
     * @param {string} key - The base key
     * @returns {string} The prefixed key
     */
    _getKey(key) {
        return `${this.prefix}${key}`;
    }
    
    /**
     * Gets a value by key
     * @param {string} key - The key to get
     * @returns {Promise<string>} The value
     */
    async get(key) {
        const fullKey = this._getKey(key);
        logger.debug(`RedisStore: Getting key ${fullKey}`);
        
        try {
            return await this.client.get(fullKey);
        } catch (error) {
            logger.error(`RedisStore: Failed to get key ${fullKey}`, { error });
            throw error;
        }
    }
    
    /**
     * Sets a key to a value
     * @param {string} key - The key to set
     * @param {string} value - The value to set
     * @returns {Promise<void>}
     */
    async set(key, value) {
        const fullKey = this._getKey(key);
        logger.debug(`RedisStore: Setting key ${fullKey}`);
        
        try {
            await this.client.set(fullKey, value, 'EX', this.ttl);
        } catch (error) {
            logger.error(`RedisStore: Failed to set key ${fullKey}`, { error });
            throw error;
        }
    }
    
    /**
     * Deletes a key
     * @param {string} key - The key to delete
     * @returns {Promise<boolean>} Whether the key was deleted
     */
    async delete(key) {
        const fullKey = this._getKey(key);
        logger.debug(`RedisStore: Deleting key ${fullKey}`);
        
        try {
            const result = await this.client.del(fullKey);
            return result > 0;
        } catch (error) {
            logger.error(`RedisStore: Failed to delete key ${fullKey}`, { error });
            throw error;
        }
    }
    
    /**
     * Gets all keys matching the prefix
     * @returns {Promise<Array<string>>} All keys in the store
     */
    async keys() {
        try {
            const keys = await this.client.keys(`${this.prefix}*`);
            return keys.map(key => key.substring(this.prefix.length));
        } catch (error) {
            logger.error(`RedisStore: Failed to get keys`, { error });
            throw error;
        }
    }
}

/**
 * Creates an appropriate store based on configuration
 * @param {Object} config - Store configuration
 * @returns {Store} The configured store
 */
export function createStore(config = {}) {
    const { type = 'memory', ...options } = config;
    
    switch (type.toLowerCase()) {
        case 'memory':
            return new MemoryStore();
            
        case 'redis':
            if (!options.client) {
                throw new Error('Redis client required for Redis store');
            }
            return new RedisStore(options.client, options);
            
        default:
            throw new Error(`Unknown store type: ${type}`);
    }
} 