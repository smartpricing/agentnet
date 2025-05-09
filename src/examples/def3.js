import { AgentLoaderFile, AgentClient, NatsIO, Bindings, Message } from "../index.js"

// NatsIO instance
const io = NatsIO({
    servers: ['nats://localhost:4222']
})

// Load the agents from the YAML file
const agents = await AgentLoaderFile('./src/examples/agents-smartness.yaml', {
    bindings: { [Bindings.NatsIO]: io }
})

// Entry point
const agentSmartness = await agents.smartnessAgent
await agentSmartness.compile()

// Accomodation agent
const agentAccomodation = await agents.accomodationAgent
agentAccomodation.tools.getRoomsListTool.bind(async (state, input) => {
    return { answer: "We have Double room with a view of the sea and a single room with a view of the pool, and a suite with a view of the city." }
})
agentAccomodation.tools.getRoomDetailTool.bind(async (state, input) => {
    return { answer: "The Double room with a view of the sea has a king size bed, a private balcony, and a view of the sea." }
})
await agentAccomodation.compile()

// Booking agent
const agentBooking = await agents.bookingAgent
agentBooking.tools.bookRoomTool.bind(async (state, input) => {
    return { answer: "The room " + input.roomName + " has been booked for the dates " + input.checkinDate + " to " + input.checkoutDate + "." }
})
await agentBooking.compile()

// Hotel review agent
const agentHotelReview = await agents.hotelReviewAgent
agentHotelReview.tools.getHotelReviewsTool.bind(async (state, input) => {
    return { answer: "The hotel " + input.hotelName + " has a 4.5 star rating and a 9.2 out of 10 guest satisfaction score." }
})
await agentHotelReview.compile()

// Pricing agent
const agentPricing = await agents.pricingAgent
agentPricing.tools.getPricingTool.bind(async (state, input) => {
    return { answer: "The room " + input.roomName + " has a price of 200€ per night." }
})
await agentPricing.compile()

// Wait for 2 seconds before proceeding in order to allow self discovery
await new Promise(resolve => setTimeout(resolve, 2000))

// Agent client
const agentClient = AgentClient()   
const message = new Message({
    content: "What rooms do you have from 2025-05-10 to 2025-05-15 for 2 guests? Give me the review of the hotel Flora",
    sessionId: "67a71e42-a7d8-1db2-ad17-64e1c8546b21"
})
const res = await agentClient.queryIo(io, 'smartnessAgent', message)
console.log("=======\n", res.getContent())
//const res2 = await agentClient.queryIo(io, 'smartnessAgent', "Quanto costa la camera doppia del Flora per il 10-05-2025 per due persone? Prenotala se costa meno di 100€ la camera double con vista mare per il 10-05-2025 al hotel Flora")
//console.log("=======\n", res2)