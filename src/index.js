import * as _Agent from "./agent/agent.js";
import * as _AgentLoader from "./agent/agent-loader.js";
import * as _AgentClient from "./agent/client.js";
import _Gemini from "./llm/gemini.js";
import _GPT from "./llm/gpt.js";
import { 
    redisStore, 
    postgresStore, 
    memoryStore,
    session 
} from "./store/store.js";

export const AgentLoaderFile = _AgentLoader.AgentLoaderFile
export const AgentLoaderJSON = _AgentLoader.AgentLoaderJSON

export const Agent = _Agent.Agent
export const AgentClient = _AgentClient.AgentClient
export const LLMRuntime = {
    GPT: _GPT,
    Gemini: _Gemini
}

export const Gemini = _Gemini
export const GPT = _GPT

export const PostgresStore = postgresStore
export const RedisStore = redisStore
export const MemoryStore = memoryStore
export const SessionStore = session

import { connect } from "@nats-io/transport-node"
export const NatsIO = (config) => {
    let connected = false
    let nc = null
    return {
        type: 'NatsIO',
        connect: async () => {
            if (connected) {
                return nc
            }
            nc = await connect(config)
            connected = true
            return nc
        },
        query: async (target, message) => {
            const nc = await this.connect()
            return await nc.request(target, message.serialize(), {replyTo: target + '.reply'})
        }
    }
}
export const Bindings = {
    NatsIO: 'NatsIO',
    Postgres: 'Postgres',
    Redis: 'Redis',
    Memory: 'Memory'
}

export class Message {
    #content 
    #session
    constructor(input) {
        if (typeof input === 'string') {
            this.#content = input
        } else {
            this.#content = input.content 
            this.#session = input.session || {}
        }
    }
    getContent() {
        return this.#content
    }
    getSessionId() {
        return this.#session.id || null
    }
    getSession() {
        return this.#session
    }
    serialize() {
        return JSON.stringify({
            content: this.#content,
            session: this.#session
        })
    }
    deserialize(data) {
        const parsed = JSON.parse(data)
        this.#content = parsed.content 
        this.#session = parsed.session || {}
    }
}

export class Response {
    #content
    #session
    constructor(output) {
        this.#content = output.content
        this.#session = output.session
    }
    getContent() {
        return this.#content
    }
    getSession() {
        return this.#session
    }
    serialize() {
        return JSON.stringify({
            content: this.#content,
            session: this.#session
        })
    }
    deserialize(data) {
        const parsed = JSON.parse(data)
        this.#content = parsed.content
        this.#session = parsed.session
    }
}