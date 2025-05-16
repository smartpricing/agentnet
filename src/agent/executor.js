import { logger } from '../utils/logger.js';
import { 
	ToolExecutionError, 
	LLMError, 
	TimeoutError,
	withTimeout,
	withRetry 
} from '../errors/index.js';

const DEFAULT_TOOL_TIMEOUT = process.env.AGENT_DEFAULT_TOOL_TIMEOUT || 120000;
const DEFAULT_LLM_TIMEOUT = process.env.AGENT_DEFAULT_LLM_TIMEOUT || 120000;

/**
 * Emits an event to the hooks system if hooks are available
 * @param {Object} hooks - Event hooks
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
async function emit(hooks, event, data) {
	if (hooks === null) {
		return;
	}
	
	try {
		hooks.emit(event, data);
	} catch (error) {
		logger.warn(`Error emitting ${event} event`, { error, data });
	}
}

/**
 * Builds the tools and handoffs map for the executor
 * @param {Object} toolsAndHandoffsMap - Map to populate
 * @param {Array} tools - Tool definitions
 * @param {Array} handoffs - Handoff definitions
 */
export function makeToolsAndHandoffsMap(llmType, toolsAndHandoffsMap, tools, handoffs) {
	if (!tools) {
		return;
	}
	
	try {
		// Process tools
		for (const tool of tools) {
			if (!tool) {
				logger.warn('Skipping undefined tool');
				continue;
			}
			
			if (!tool.schema) {
				toolsAndHandoffsMap.tools.push(tool);
				continue;
			}
			
			// Add tool schema to tools list
			toolsAndHandoffsMap.tools.push(tool.schema);
			
			// Map tool name to function
			toolsAndHandoffsMap[tool.name] = {
				function: tool.function,
				type: 'tool'
			};
		}
		
		// Process handoffs (which may be a nested array)
		if (handoffs && Array.isArray(handoffs)) {
			const flatHandoffs = handoffs.flat().filter(Boolean);
			
			for (const handoff of flatHandoffs) {
				if (!handoff || !handoff.schema || !handoff.name) {
					logger.warn('Skipping invalid handoff definition', { handoff });
					continue;
				}

                // TODO: Remove this once we have a better way to handle handoffs
                if (llmType === 'openai') {
                    handoff.schema.type = 'function'
                }
				
				// Add handoff schema to tools list
				toolsAndHandoffsMap.tools.push(handoff.schema);
				
				// Map handoff name to function
				toolsAndHandoffsMap[handoff.name] = {
					function: handoff.function,
					type: 'handoff'
				};
			}
		}
	} catch (error) {
		logger.error('Error building tools and handoffs map', { error });
		throw error;
	}
}

/**
 * Safely executes a tool or handoff function with timeout and error handling
 * @param {Function} func - Tool/handoff function to execute
 * @param {string} name - Tool/handoff name
 * @param {string} type - 'tool' or 'handoff'
 * @param {Object} state - Agent state
 * @param {any} input - Tool/handoff input
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<any>} Tool execution result
 */
async function safeExecute(func, name, type, state, input, timeout = DEFAULT_TOOL_TIMEOUT) {
	if (typeof func !== 'function') {
		throw new ToolExecutionError(
			`${type} "${name}" is not a function`,
			name,
			input
		);
	}
	
	try {
		// Execute with timeout
		return await withTimeout(
			async () => {
				try {
					return await func(state, input);
				} catch (error) {
					throw new ToolExecutionError(
						`Error executing ${type} "${name}": ${error.message}`,
						name,
						input,
						error
					);
				}
			},
			timeout,
			`${type} execution: ${name}`
		);
	} catch (error) {
		// Log detailed error information
		logger.error(`${type} execution error`, { 
			error, 
			toolName: name, 
			inputSample: JSON.stringify(input).substring(0, 200) 
		});
		
		// Ensure we always return a structured error
		if (error instanceof ToolExecutionError || error instanceof TimeoutError) {
			throw error;
		}
		
		throw new ToolExecutionError(
			`Error executing ${type} "${name}": ${error.message}`,
			name,
			input,
			error
		);
	}
}

/**
 * Builds an executor for agent execution
 * @param {Object} toolsAndHandoffsMap - Map of tools and handoffs
 * @param {Object} hooks - Event hooks
 * @param {string} agentName - Agent name
 * @param {Object} api - LLM API
 * @param {Object} llmConfig - LLM configuration
 * @param {Object} runner - Runner configuration
 * @returns {Function} Executor function
 */
export async function build(
	toolsAndHandoffsMap,
	hooks, 
	agentName, 
	api, 
	llmConfig, 
	runner
) {
	const maxRuns = runner?.maxRuns || 10;
	
	try {
		// Initialize LLM client
		logger.info(`Initializing LLM client for agent ${agentName}`);
		const client = await api.getClient();
		
		// Add safe execution methods to toolsAndHandoffsMap
		toolsAndHandoffsMap.safeExecute = async (name, type, state, input, timeout) => {
			const handler = toolsAndHandoffsMap[name];
			if (!handler) {
				throw new ToolExecutionError(
					`${type} "${name}" not found`,
					name,
					input
				);
			}
			
			return await safeExecute(
				handler.function,
				name,
				type, 
				state, 
				input, 
				timeout || DEFAULT_TOOL_TIMEOUT
			);
		};
		
		// Create the executor function
		const executor = async function(state, contents, run = 0) {
			logger.info(`Running agent ${agentName} (run ${run}/${maxRuns}), conversation length: ${contents.length}`);
			
			// Emit run event
			await emit(hooks, 'executorRun', {
				agentName: agentName,
				run: run,
				state: state,
				contents: contents
			});
			
			// Check for max runs exceeded
			if (run >= maxRuns) {
				logger.warn(`Agent ${agentName} max runs reached: ${run}/${maxRuns}`);
				
				await emit(hooks, 'executorMaxRuns', {
					agentName: agentName,
					run: run,
					state: state,
					contents: contents
				});
				
				// Return the last message as the result
				return contents[contents.length - 1];
			}
			
			try {
				// Prepare input for LLM
				const input = {
					client: client,
					toolsAndHandoffsMap: toolsAndHandoffsMap,
					conversation: contents
				};
				
				// Call LLM with timeout and retry
				logger.debug(`Calling LLM for agent ${agentName}`);
				
				const response = await withRetry(
					async () => {
						try {
							return await withTimeout(
								async () => api.callModel(llmConfig, input),
								llmConfig.timeout || DEFAULT_LLM_TIMEOUT,
								`LLM call for ${agentName}`
							);
						} catch (error) {
							if (error instanceof TimeoutError) {
								throw error; // Let the retry handler deal with timeouts
							}
							
							throw new LLMError(
								`LLM API error: ${error.message}`,
								api.type || 'unknown',
								{ modelConfig: llmConfig }
							);
						}
					},
					{
						maxRetries: 2,
						onRetry: ({ attempt }) => {
							logger.warn(`Retrying LLM call for agent ${agentName} (attempt ${attempt})`);
						}
					}
				);
				
				logger.debug(`LLM response received for agent ${agentName}`);
				
				// Process the response
				const finished = await api.onResponse(state, contents, toolsAndHandoffsMap, response);
				
				// If not finished, continue with the next run
				if (finished == null) {
					return await executor(state, contents, run + 1);
				}
				
				// Emit end event
				await emit(hooks, 'executorEnd', {
					agentName: agentName,
					run: run,
					state: state,
					contents: contents,
					response: finished
				});
				
				return finished;
			} catch (error) {
				logger.error(`Error in agent ${agentName} execution`, { 
					error, 
					run, 
					maxRuns 
				});
				
				// Emit error event
				await emit(hooks, 'executorError', {
					agentName: agentName,
					run: run,
					state: state,
					contents: contents,
					error: error
				});
				
				// If we haven't hit max runs, try again
				if (run < maxRuns - 1) {
					logger.info(`Continuing after error in agent ${agentName}`);
					return await executor(state, contents, run + 1);
				}
				
				// We've reached max runs, return the error
				throw error;
			}
		};
		
		return executor;
	} catch (error) {
		logger.error(`Failed to build executor for agent ${agentName}`, { error });
		throw error;
	}
}