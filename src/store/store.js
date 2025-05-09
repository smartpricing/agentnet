import { v4 as uuid } from 'uuid'
import { createClient } from 'redis'
import pg from 'pg'

let config = {
    user: process.env.PG_USER || 'postgres',
    host: process.env.PG_HOST || 'localhost', 
    database: process.env.PG_DATABASE || 'postgres',
    password: process.env.PG_PASSWORD || 'password',
    port: process.env.PG_PORT || 5433
}

if (process.env.PG_USE_SSL == 'true' || process.env.PG_USE_SSL == true) {
    config.ssl = {
      rejectUnauthorized: false
    }
}

const pool = new pg.Pool(config)

pool.on('error', err => {
    console.log(new Date(), 'Lost Postgres connection', err)
})

export async function getClient() {
    const client = await pool.connect()
    return client
}

export function session (id) {
	let state = {}
	let conversation = []

	return {
		query: async function (agentInstance, input) {
			return await agentInstance.query(state, conversation, input)
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
			conversation = conversation.slice(-elementsToKeep)
			let additionalElementsToRemove = 0
			for (const chatIndex in conversation) {
				if (conversation[chatIndex].role !== 'user' || conversation[chatIndex].role == undefined) {
					additionalElementsToRemove += 1
				} else {
					break
				}
			}
			if (additionalElementsToRemove > 0) {
				conversation = conversation.slice(additionalElementsToRemove)
			}
		},
		setConversation: function (_conversation) {
			conversation = _conversation
		},	
		getConversation: function () {
			return conversation
		},
		load: async function (stateStore) {
			const _state = await stateStore.get(id)
			if (_state !== null) {
				const parsedState = JSON.parse(_state)
				conversation = parsedState.conversation || []
				state = parsedState.state || {}
				return {
					conversation: conversation,
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
				conversation: conversation,
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

export function postgresStore (_config = null) {
	let client = null
	let config = _config

	return {
		connect: async function () {
			if (!client) {
				client = await getClient()
			}
		},
		disconnect: async function () {
			if (client) {
				await client.end()
				client = null
			}
		},
		set: async function (key, value) {
			const id = uuid()
			return await client.query('INSERT INTO smartchat_agent.conversation_state (state_id, state, id) VALUES ($1,$2,$3) ON CONFLICT (state_id) DO UPDATE SET state_id=$1, state=$2', [key, value, id])
		},
		get: async function (key) {
			const res = await client.query('SELECT state FROM smartchat_agent.conversation_state WHERE state_id=$1', [key])
			if (res.rows.length == 1) {
				return res.rows[0].state
			}
			if (res.rows.length > 1) {
				throw 'Something went wrong at pg store'
			}
			return null
		}
	}
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