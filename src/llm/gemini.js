import { GoogleGenAI } from '@google/genai'
import { logger } from '../utils/logger.js'
import { LLMError } from '../errors/index.js'

const type = 'gemini' 

const getClient = async function () {
    try {
        if (!process.env.GEMINI_API_KEY) {
            throw new LLMError(
                'GEMINI_API_KEY environment variable is not set',
                'gemini'
            );
        }
        
        logger.debug('Initializing Gemini client');
        return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    } catch (error) {
        logger.error('Failed to initialize Gemini client', { error });
        throw new LLMError(
            `Failed to initialize Gemini client: ${error.message}`,
            'gemini',
            { originalError: error }
        );
    }
}

const callModel = async function (llmClientConfig, context) {
    const client = context.client;
    const toolsAndHandoffsMap = context.toolsAndHandoffsMap;
    const conversation = context.conversation;
    const input = {};
    
    Object.assign(input, llmClientConfig);
    input['contents'] = conversation;

    if (input.config !== undefined && input.tools !== undefined) {
        input.config.tools = toolsAndHandoffsMap.tools;
    } else if (toolsAndHandoffsMap.tools.length > 0) {
        if (input.config == undefined) {
            input.config = {};
        }
        input.config.tools = [{ functionDeclarations: toolsAndHandoffsMap.tools }];
    }

    logger.debug('Calling Gemini model', { 
        model: input.model,
        conversationLength: conversation.length,
        toolsCount: toolsAndHandoffsMap.tools.length
    });
    
    try {
        const res = await client.models.generateContent(input);
        logger.debug('Gemini response received', {
            responseType: res.response?.candidates ? 'candidates' : 'unknown',
            hasContent: !!res.response?.candidates?.[0]?.content
        });
        return res;
    } catch (error) {
        logger.error('Gemini API error', { 
            error,
            modelName: input.model
        });
        
        throw new LLMError(
            `Gemini API error: ${error.message}`,
            'gemini',
            {
                statusCode: error.status || error.statusCode,
                modelName: input.model
            }
        );
    }
}

const onResponse = async function (state, conversation, toolsAndHandoffsMap, response) {
    if (response.text !== undefined) {
        logger.debug('Gemini response contains text, returning directly');
        conversation.push({ role: 'model', parts: [{ text: response.text }] });
        return response.text;
    }
    
    logger.debug('Gemini response contains function calls', {
        functionCallCount: response.functionCalls?.length || 0
    });
    
    for (const toolCall of response.functionCalls) {
        const args = toolCall.args;
        const name = toolCall.name;
        
        logger.debug('Executing tool from Gemini', { 
            toolName: name,
            argsPreview: JSON.stringify(args).substring(0, 100)
        });
        
        try {
            if (!toolsAndHandoffsMap[name] || !toolsAndHandoffsMap[name].function) {
                throw new Error(`Tool "${name}" not found or has no function implementation`);
            }

            let result = null
            if (toolsAndHandoffsMap[name].type === 'handoff') {
                result = await toolsAndHandoffsMap[name].function(conversation, state, args);
            } else {
                result = await toolsAndHandoffsMap[name].function(state, args);
            }
            if (toolsAndHandoffsMap[name].type === 'handoff') {
                const resultParsed = JSON.parse(result)
                // Update state with the result
                if (resultParsed.session) {
                    for (const key of Object.keys(resultParsed.session)) {
                        state[key] = resultParsed.session[key]
                    }
                }
            }
            
            const function_response_part = {
                name: name,
                response: typeof result === 'string' ? { answer: result } : result
            };
            
            // Append function call and result of the function execution to contents
            conversation.push({ role: 'model', parts: [{ functionCall: toolCall }] });
            conversation.push({ role: 'user', parts: [{ functionResponse: function_response_part }] });
            
            logger.debug('Tool execution successful', { toolName: name });
        } catch (error) {
            logger.error(`Error executing tool "${name}"`, { error });
            // Return error as function response
            const errorResponse = {
                name: name,
                response: { error: error.message }
            };
            
            conversation.push({ role: 'model', parts: [{ functionCall: toolCall }] });
            conversation.push({ role: 'user', parts: [{ functionResponse: errorResponse }] });
        }
    }
    
    return null;
}

const prompt = async function (conversation, formattedPrompt) {
    logger.debug('Adding user prompt to conversation', {
        promptPreview: formattedPrompt.substring(0, 100)
    });
    
    conversation.push({
        role: 'user',
        parts: [{ text: formattedPrompt}]
    });
}

export default {
    type,
    getClient,
    prompt,
    callModel,
    onResponse
}