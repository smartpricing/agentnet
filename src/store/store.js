import { v4 as uuid } from 'uuid'
import { createClient } from 'redis'
import pgp from 'pg-promise'
import { Conversation } from '../utils/conversation.js'

export function session (id) {
	let state = {}
	let conversationManager = new Conversation()

	return {
		query: async function (agentInstance, input) {
			return await agentInstance.query(state, conversationManager.getRawConversation(), input)
		},
		setState: function (_state) {
			state = _state
		},
		mergeState: function (_state) {
			Object.keys(_state).forEach((key) => {
				state[key] = _state[key]
			})
		},		
		getState: function () {
			return state
		},
		trimConversation: function (elementsToKeep) {
			conversationManager.trim(elementsToKeep)
		},
		setConversation: function (_conversation) {
			// Support both array and Conversation objects
			if (_conversation instanceof Conversation) {
				conversationManager = _conversation;
			} else if (Array.isArray(_conversation)) {
				conversationManager.importFromArray(_conversation);
			}
		},	
		getConversation: function () {
			// Return raw conversation for backward compatibility
			return conversationManager.getRawConversation()
		},
		getConversationManager: function() {
			return conversationManager
		},
		load: async function (stateStore) {
			const _state = await stateStore.get(id)
			if (_state !== null) {
				const parsedState = JSON.parse(_state)
				
				// Handle both old-style conversation array and new-style serialized Conversation
				if (parsedState.conversationData) {
					conversationManager.deserialize(parsedState.conversationData)
				} else if (Array.isArray(parsedState.conversation)) {
					conversationManager.importFromArray(parsedState.conversation)
				}
				
				state = parsedState.state || {}
				return {
					// Return raw conversation for backward compatibility
					conversation: conversationManager.getRawConversation(),
					state: state
				}
			}
			return {
				conversation: [],
				state: {}
			}
		},
		dump: async function (stateStore) {
			return await stateStore.set(id, JSON.stringify({
				// Keep conversation array for backward compatibility
				conversation: conversationManager.getRawConversation(),
				// Add serialized conversation data with metadata
				conversationData: conversationManager.serialize(),
				state: state
			}))
		},		
	}
}

export function redisStore (_config = null) {
	let client = null
	let config = _config

	return {
		connect: async function () {
			if (!client) {
				client = createClient(config || { url: 'redis://localhost:6379' })			
				client.connect()
			}
		},
		disconnect: async function () {
			if (client) {
				await client.disconnect()
				client = null
			}
		},
		set: async function (key, value) {
			return await client.set(key, value)
		},
		get: async function (key) {
			return await client.get(key)
		}
	}
}

export function postgresStore(config = null) {
	let db = null;
	const pgPromise = pgp(); // Initialize pg-promise
	// Default connection config
	const defaultConfig = {
		host: process.env.PG_HOST || 'localhost',
		port: process.env.PG_PORT || 5433,
		database: process.env.PG_DATABASE || 'postgres',
		user: process.env.PG_USER || 'postgres',
		password: process.env.PG_PASSWORD || 'password',
		max: 30, // max number of clients in the pool
		ssl: process.env.PG_USE_SSL === 'true' ? { rejectUnauthorized: false } : null,
		table: 'conversation_state',
		schema: 'smartchat_agent'
	};

	const connectionConfig = config || defaultConfig;

	return {
		connect: async function() {
			if (db === null) {				
				// For URL-style connection string
				if (typeof connectionConfig === 'string') {
					db = pgPromise(connectionConfig);
				} else {
					db = pgPromise(connectionConfig);
				}
				
				// Test connection
				try {
					await db.connect();
					
					// Create schema if not exists
					await db.none('CREATE SCHEMA IF NOT EXISTS $1:name', [connectionConfig.schema]);
					
					// Create table if not exists
					await db.none(`
						CREATE TABLE IF NOT EXISTS $1:name.$2:name (
							id UUID PRIMARY KEY,
							state_id TEXT, 
							state TEXT,
							updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
						)
					`, [connectionConfig.schema, connectionConfig.table]);
					
					// Create unique index if not exists
					await db.none(`
						CREATE UNIQUE INDEX IF NOT EXISTS idx_acc_agent_chat_id 
						ON $1:name.$2:name(state_id)
					`, [connectionConfig.schema, connectionConfig.table]);
					
				} catch (error) {
					throw error;
				}
			}
		},
		
		disconnect: async function() {
			if (db) {
				await pgPromise.end();
				db = null;
			}
		},
		
		set: async function(key, value) {
			const id = uuid();
			try {
				return await db.one(
					'INSERT INTO $1:name.$2:name (state_id, state, id) VALUES ($3, $4, $5) ON CONFLICT (state_id) DO UPDATE SET state=$4, updated_at=CURRENT_TIMESTAMP RETURNING id', 
					[connectionConfig.schema, connectionConfig.table, key, value, id]
				);
			} catch (error) {
				console.error('Error storing state:', error);
				throw error;
			}
		},
		
		get: async function(key) {
			try {
				const result = await db.oneOrNone(
					'SELECT state FROM $1:name.$2:name WHERE state_id = $3',
					[connectionConfig.schema, connectionConfig.table, key]
				);
				return result ? result.state : null;
			} catch (error) {
				console.error('Error retrieving state:', error);
				throw error;
			}
		}
	};
}

export function memoryStore () {
	let state = {}

	return {
		connect: async function () {},
		disconnect: async function () {},
		set: async function (key, value) {
			state[key] = value
			return state[key]
		},
		get: async function (key) {
			return state[key] || null
		}	
	}
}