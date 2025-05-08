import { Debug, Info, Warning } from '../misc/logger.js'

async function emit (hooks, event, data) {
	if (hooks !== null) {
		hooks.emit(event, data)
	}
}

export function makeToolsAndHandoffsMap (toolsAndHandoffsMap, tools, handoffs) {
    if (tools == undefined) {
        return
    }
	for (const tool of tools) {
		if (tool.schema == undefined) {
			toolsAndHandoffsMap.tools.push(tool)
			continue
		}
		toolsAndHandoffsMap.tools.push(tool.schema) 
		toolsAndHandoffsMap[tool.name] = {
			function: tool.function,
			type: 'tool'
		}
	}
	for (const handoff of handoffs.flat()) {
		toolsAndHandoffsMap.tools.push(handoff.schema) 
		toolsAndHandoffsMap[handoff.name] = {
			function: handoff.function,
			type: 'handoff'
		}		
	}    
}

export async function build (
	toolsAndHandoffsMap,
	hooks, agentName, api, 
	llmConfig, runner) {
	const maxRuns = runner.maxRuns || 1
	const client = await api.getClient()

	const executor = async function (state, contents, run = 0) {
		Info('Run agent:', agentName, 'run:', run)
		emit(hooks, 'executorRun', {
			agentName: agentName,
			run: run,
			state: state,
			contents: contents
		})
		if (run > maxRuns) {
			Warning('Agent:', agentName, 'max runs reached:', run, maxRuns)
			emit(hooks, 'executorMaxRuns', {
				agentName: agentName,
				run: run,
				state: state,
				contents: contents
			})			
		  	return contents[contents.length - 1]
		}
		const input = {
			client: client,
			toolsAndHandoffsMap: toolsAndHandoffsMap,
			conversation: contents
		}

		Info('Before callModel', agentName, api.type)
		const response = await api.callModel(llmConfig, input)
		Debug('Agent callModel response', agentName, response)
        
		const finished = await api.onResponse(state, contents, toolsAndHandoffsMap, response)
		Debug('Agent onResponse response', agentName, finished)
		if (finished == null) {
			return await executor(state, contents, run += 1)
		}
		emit(hooks, 'executorEnd', {
			agentName: agentName,
			run: run,
			state: state,
			contents: contents,
			response: finished
		})		
		return finished
	}
	return executor
}