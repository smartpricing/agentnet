import { AgentLoaderFile, AgentClient, NatsIO, Bindings, Message, PostgresStore, RedisStore, MemoryStore } from "../../src/index.js"

// NatsIO instance
const io = NatsIO({
    servers: ['nats://localhost:4222']
})

// Load the agents from the YAML file
const agents = await AgentLoaderFile('./examples/smartness/agents-smartness.yaml', {
    bindings: { [Bindings.NatsIO]: io, [Bindings.Postgres]: PostgresStore(), [Bindings.Redis]: RedisStore(), [Bindings.Memory]: MemoryStore() }
})

// Entry point
const agentSmartness = await agents.entrypoint
await agentSmartness.compile()

// Accomodation agent
const agentAccomodation = await agents.accomodation
agentAccomodation.tools.getRoomsListTool.bind(async (state, input) => {
    return { answer: "We have Double room with a view of the sea and a single room with a view of the pool, and a suite with a view of the city." }
})
agentAccomodation.tools.getRoomDetailTool.bind(async (state, input) => {
    return { answer: "The Double room with a view of the sea has a king size bed, a private balcony, and a view of the sea." }
})
agentAccomodation.prompt(async (state, input) => {
    state._accomodationAgent = true
    return input
})
await agentAccomodation.compile()

// Booking agent
const agentBooking = await agents.booking
agentBooking.tools.bookRoomTool.bind(async (state, input) => {
    return { answer: "The room " + input.roomName + " has been booked for the dates " + input.checkinDate + " to " + input.checkoutDate + "." }
})
await agentBooking.compile()

// Hotel review agent
const agentHotelReview = await agents.review
agentHotelReview.tools.getHotelReviewsTool.bind(async (state, input) => {
    return { answer: "The hotel " + input.hotelName + " has a 4.5 star rating and a 9.2 out of 10 guest satisfaction score." }
})
await agentHotelReview.compile()

// Pricing agent
const agentPricing = await agents.pricing
agentPricing.tools.getPricingTool.bind(async (state, input) => {
    return { answer: "The room " + input.roomName + " has a price of 200€ per night." }
})
await agentPricing.compile()

// Wait for 2 seconds before proceeding in order to allow self discovery
await new Promise(resolve => setTimeout(resolve, 2000))

// Agent client
const agentClient = AgentClient()   
const message = new Message({
    content: "What rooms do you have from 2025-05-25 to 2025-05-30 for 3 guests For the hotel Flora? Give me the review of the hotel Flora",
    session: {
        id: "67a71e42-a7d8-1db2-ad17-64e1c8546b20"
    }
})
const res = await agentClient.queryIo(io, 'entrypoint', message)
console.log("=======\n", res.getContent())
console.log("=======\n", res.getSession())

const message2 = new Message({
    content: "Quanto costa la camera doppia del Flora per il 10-05-2025 per due persone? Prenotala se costa meno di 100€ la camera double con vista mare per il 10-05-2025 al hotel Flora",
    session: {
        id: "67a71e42-a7d8-1db2-ad17-64e1c8546b21"
    }
})
const res2 = await agentClient.queryIo(io, 'entrypoint', message2)
console.log("=======\n", res2.getContent())
console.log("=======\n", res2.getSession())
