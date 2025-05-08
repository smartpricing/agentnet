import * as _Agent from "./agent/agent.js";
import * as _AgentLoader from "./agent/agent-loader.js";
import * as _AgentClient from "./agent/client.js";
import * as _Store from "./store/store.js";
import _Gemini from "./llm/gemini.js";
import _GPT from "./llm/gpt.js";

export const AgentLoaderFile = _AgentLoader.AgentLoaderFile
export const AgentLoaderJSON = _AgentLoader.AgentLoaderJSON
//export const AgentLoader = _AgentLoader.AgentLoader

export const Agent = _Agent.Agent
export const AgentClient = _AgentClient.AgentClient
export const LLMRuntime = {
    GPT: _GPT,
    Gemini: _Gemini
}

export const Gemini = _Gemini
export const GPT = _GPT

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
        query: async (target, input) => {
            const nc = await this.connect()
            return await nc.request(target, input, {replyTo: target + '.reply'})
        }
    }
}
export const Bindings = {
    NatsIO: 'NatsIO'
}
