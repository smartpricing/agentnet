import { AgentLoader, AgentClient, NatsIO } from "../index.js"

const agents = await AgentLoader('./src/examples/agents.yaml')

const agentTravel = await agents.advancedTravelAgent
agentTravel.tools.flightSearchTool.bind(async (state, input) => {
    return { answer: "The fly is from New York to Los Angeles at 10:00 AM" }
})
await agentTravel.compile()

const agentWeather = await agents.weatherAgent
agentWeather.tools.weatherSearchTool.bind(async (state, input) => {
    return { answer: "The weather in New York is sunny" }
})
await agentWeather.compile()

const agentNews = await agents.newsAgent
agentNews.tools.newsSearchTool.bind(async (state, input) => {
    return { answer: "Latest news: AI is taking over!" }
})
await agentNews.compile()

const agentCalculator = await agents.calculatorAgent
agentCalculator.tools.calculationTool.bind(async (state, input) => {
    return { answer: `The result of ${input.expression} is 42` }
})
await agentCalculator.compile()

const agentTranslation = await agents.translationAgent
agentTranslation.tools.translationTool.bind(async (state, input) => {
    return { answer: `'${input.text}' translated to ${input.targetLanguage} is 'Hola Mundo'` }
})
await agentTranslation.compile()

const agentCalendar = await agents.calendarAgent
agentCalendar.tools.createEventTool.bind(async (state, input) => {
    return { answer: `Event '${input.title}' created for ${input.startTime}` }
})
agentCalendar.tools.listEventsTool.bind(async (state, input) => {
    return { answer: `Events for ${input.startDate}: Meeting at 10 AM` }
})
await agentCalendar.compile()

const agentStockTicker = await agents.stockTickerAgent
agentStockTicker.tools.stockPriceTool.bind(async (state, input) => {
    return { answer: `The price of ${input.symbol} is $100` }
})
await agentStockTicker.compile()

const io = NatsIO({
    servers: ['nats://localhost:4222']
})

const agentClient = AgentClient()
//const res = await agentClient.queryAgent(agentTravelInstance, "Find me a flight from New York to Los Angeles")
//console.log(res)

// Wait for 2 seconds before proceeding
await new Promise(resolve => setTimeout(resolve, 2000));

const res = await agentClient.queryIo(io, 'advancedTravelAgent', "Find me a flight from New York to Los Angeles. How is the weather in New York? Give me some news. Also create the birthday event for my friend tomorrow 09-05-2025. RETURN TO ME THE RESULTS")
console.log(res)

//const res = await agent.query("Find me a flight from New York to Los Angeles")
//console.log(res)