import { AgentLoaderFile, Message, Bindings, NatsIO, MemoryStore, AgentClient } from "../../src/index.js";
import { v4 as uuidv4 } from 'uuid';

// Mock database of events
const mockDatabase = {
  events: {
    "evt-001": {
      id: "evt-001",
      title: "Weekly Team Meeting",
      startDateTime: "2023-10-10T10:00:00",
      endDateTime: "2023-10-10T11:00:00",
      description: "Regular team sync to discuss project progress",
      location: "Conference Room A",
      participants: ["alice@example.com", "bob@example.com", "carol@example.com"],
      createdBy: "alice@example.com",
      createdAt: "2023-10-01T08:30:00"
    },
    "evt-002": {
      id: "evt-002",
      title: "Product Launch Planning",
      startDateTime: "2023-10-12T14:00:00",
      endDateTime: "2023-10-12T16:00:00",
      description: "Finalize details for the upcoming product launch",
      location: "Marketing Department",
      participants: ["bob@example.com", "dave@example.com", "eve@example.com"],
      createdBy: "bob@example.com",
      createdAt: "2023-10-02T09:15:00"
    },
    "evt-003": {
      id: "evt-003",
      title: "Client Meeting - Acme Corp",
      startDateTime: "2023-10-11T09:30:00",
      endDateTime: "2023-10-11T10:30:00",
      description: "Presentation of the new proposal",
      location: "Virtual - Zoom",
      participants: ["alice@example.com", "carol@example.com", "client@acmecorp.com"],
      createdBy: "alice@example.com",
      createdAt: "2023-10-03T14:20:00"
    },
    "evt-004": {
      id: "evt-004",
      title: "Quarterly Budget Review",
      startDateTime: "2023-10-15T11:00:00",
      endDateTime: "2023-10-15T12:30:00",
      description: "Review of Q3 expenses and planning for Q4",
      location: "Finance Conference Room",
      participants: ["alice@example.com", "dave@example.com", "finance@example.com"],
      createdBy: "dave@example.com",
      createdAt: "2023-10-05T11:45:00"
    }
  },
  users: {
    "alice@example.com": {
      name: "Alice Smith",
      workingHours: { start: "09:00", end: "17:00" },
      timezone: "America/New_York"
    },
    "bob@example.com": {
      name: "Bob Johnson",
      workingHours: { start: "08:00", end: "16:00" },
      timezone: "America/Chicago"
    },
    "carol@example.com": {
      name: "Carol Williams",
      workingHours: { start: "10:00", end: "18:00" },
      timezone: "America/Los_Angeles"
    },
    "dave@example.com": {
      name: "Dave Brown",
      workingHours: { start: "09:00", end: "17:00" },
      timezone: "America/New_York"
    },
    "eve@example.com": {
      name: "Eve Davis",
      workingHours: { start: "08:30", end: "16:30" },
      timezone: "America/Chicago"
    }
  }
};

// Helper functions for event management
function generateEventId() {
  return `evt-${uuidv4().substring(0, 6)}`;
}

function formatDate(dateString) {
  return new Date(dateString).toISOString().split('T')[0];
}

function parseDate(dateString) {
  return new Date(dateString);
}

function isOverlapping(event1, event2) {
  const start1 = new Date(event1.startDateTime);
  const end1 = new Date(event1.endDateTime);
  const start2 = new Date(event2.startDateTime);
  const end2 = new Date(event2.endDateTime);
  
  return (start1 < end2 && start2 < end1);
}

function getEventsInDateRange(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  
  return Object.values(mockDatabase.events).filter(event => {
    const eventStart = parseDate(event.startDateTime);
    return eventStart >= start && eventStart <= end;
  });
}

// Set up the NATS instance for inter-agent communication
const natsIO = NatsIO();

// Main function to set up and demonstrate the event planner system
async function main() {
  console.log("Loading event planner agents...");
  
  // Load all agents from the YAML file
  const agents = await AgentLoaderFile('./examples/event-planner/agents.yaml', {
    bindings: { [Bindings.NatsIO]: natsIO, [Bindings.Memory]: MemoryStore() }
  });
  
  // Bind tool implementations for Planner Agent
  agents.plannerAgent.tools.createEvent.bind(async (state, input) => {
    const { title, startDateTime, endDateTime, description, location, participants, reminders } = input;
    
    // Generate a new unique event ID
    const eventId = generateEventId();
    
    // Create the new event
    const newEvent = {
      id: eventId,
      title,
      startDateTime,
      endDateTime,
      description: description || "",
      location: location || "Not specified",
      participants: participants || [],
      reminders: reminders || [],
      createdBy: state.session?.userId || "system",
      createdAt: new Date().toISOString()
    };
    
    // Add the event to the database
    mockDatabase.events[eventId] = newEvent;
    
    return {
      success: true,
      eventId,
      message: `Event "${title}" has been created successfully.`,
      event: newEvent
    };
  });
  
  agents.plannerAgent.tools.listEvents.bind(async (state, input) => {
    const { startDate, endDate, maxResults } = input;
    
    // Get events in the specified date range
    let events = getEventsInDateRange(startDate, endDate);
    
    // Limit the number of results if specified
    if (maxResults && events.length > maxResults) {
      events = events.slice(0, maxResults);
    }
    
    return {
      success: true,
      count: events.length,
      events: events.map(event => ({
        id: event.id,
        title: event.title,
        startDateTime: event.startDateTime,
        endDateTime: event.endDateTime,
        location: event.location
      }))
    };
  });
  
  agents.plannerAgent.tools.getEventDetails.bind(async (state, input) => {
    const { eventId } = input;
    const event = mockDatabase.events[eventId];
    
    if (!event) {
      return {
        success: false,
        message: `Event with ID ${eventId} not found.`
      };
    }
    
    return {
      success: true,
      event
    };
  });
  
  agents.plannerAgent.tools.updateEvent.bind(async (state, input) => {
    const { eventId, updates } = input;
    const event = mockDatabase.events[eventId];
    
    if (!event) {
      return {
        success: false,
        message: `Event with ID ${eventId} not found.`
      };
    }
    
    // Apply updates to the event
    Object.keys(updates).forEach(key => {
      if (key in event) {
        event[key] = updates[key];
      }
    });
    
    // Update the last modified information
    event.lastModifiedBy = state.session?.userId || "system";
    event.lastModifiedAt = new Date().toISOString();
    
    return {
      success: true,
      message: `Event "${event.title}" has been updated successfully.`,
      event
    };
  });
  
  agents.plannerAgent.tools.deleteEvent.bind(async (state, input) => {
    const { eventId, notifyParticipants } = input;
    
    if (!mockDatabase.events[eventId]) {
      return {
        success: false,
        message: `Event with ID ${eventId} not found.`
      };
    }
    
    const eventTitle = mockDatabase.events[eventId].title;
    
    // Remove the event from the database
    delete mockDatabase.events[eventId];
    
    return {
      success: true,
      message: `Event "${eventTitle}" has been deleted successfully.`,
      notificationSent: notifyParticipants === true
    };
  });
  
  agents.plannerAgent.tools.checkAvailability.bind(async (state, input) => {
    const { startDateTime, endDateTime, participants } = input;
    
    const potentialEvent = {
      startDateTime,
      endDateTime
    };
    
    // Find conflicts with existing events
    const conflicts = Object.values(mockDatabase.events).filter(event => {
      // If no participants specified, check for all events
      if (!participants || participants.length === 0) {
        return isOverlapping(event, potentialEvent);
      }
      
      // If participants specified, only check events with overlapping participants
      const hasOverlappingParticipants = participants.some(participant => 
        event.participants.includes(participant)
      );
      
      return hasOverlappingParticipants && isOverlapping(event, potentialEvent);
    });
    
    return {
      available: conflicts.length === 0,
      conflicts: conflicts.map(event => ({
        id: event.id,
        title: event.title,
        startDateTime: event.startDateTime,
        endDateTime: event.endDateTime,
        participants: event.participants
      }))
    };
  });
  
  // Bind tool implementations for Event Finder Agent
  agents.eventFinderAgent.tools.searchEvents.bind(async (state, input) => {
    const { query, startDate, endDate, participants, locations, maxResults } = input;
    
    // Start with all events
    let filteredEvents = Object.values(mockDatabase.events);
    
    // Filter by date range if specified
    if (startDate && endDate) {
      const start = parseDate(startDate);
      const end = parseDate(endDate);
      
      filteredEvents = filteredEvents.filter(event => {
        const eventStart = parseDate(event.startDateTime);
        return eventStart >= start && eventStart <= end;
      });
    }
    
    // Filter by participants if specified
    if (participants && participants.length > 0) {
      filteredEvents = filteredEvents.filter(event => 
        participants.some(participant => event.participants.includes(participant))
      );
    }
    
    // Filter by locations if specified
    if (locations && locations.length > 0) {
      filteredEvents = filteredEvents.filter(event => 
        locations.some(location => 
          event.location.toLowerCase().includes(location.toLowerCase())
        )
      );
    }
    
    // Filter by text query
    if (query) {
      const lowerQuery = query.toLowerCase();
      filteredEvents = filteredEvents.filter(event => 
        event.title.toLowerCase().includes(lowerQuery) ||
        (event.description && event.description.toLowerCase().includes(lowerQuery))
      );
    }
    
    // Limit results if specified
    if (maxResults && filteredEvents.length > maxResults) {
      filteredEvents = filteredEvents.slice(0, maxResults);
    }
    
    return {
      success: true,
      count: filteredEvents.length,
      events: filteredEvents.map(event => ({
        id: event.id,
        title: event.title,
        startDateTime: event.startDateTime,
        endDateTime: event.endDateTime,
        location: event.location,
        participants: event.participants
      }))
    };
  });
  
  agents.eventFinderAgent.tools.findConflicts.bind(async (state, input) => {
    const { startDate, endDate, participants } = input;
    
    // Get all events in the date range
    const events = getEventsInDateRange(startDate, endDate);
    
    // Find events with overlapping times
    const conflicts = [];
    
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        if (isOverlapping(events[i], events[j])) {
          // If participants specified, check if any are involved in both events
          if (participants && participants.length > 0) {
            const participantOverlap = participants.some(participant => 
              events[i].participants.includes(participant) && 
              events[j].participants.includes(participant)
            );
            
            if (!participantOverlap) continue;
          }
          
          conflicts.push({
            event1: {
              id: events[i].id,
              title: events[i].title,
              startDateTime: events[i].startDateTime,
              endDateTime: events[i].endDateTime,
              participants: events[i].participants
            },
            event2: {
              id: events[j].id,
              title: events[j].title,
              startDateTime: events[j].startDateTime,
              endDateTime: events[j].endDateTime,
              participants: events[j].participants
            }
          });
        }
      }
    }
    
    return {
      success: true,
      conflictsFound: conflicts.length > 0,
      conflicts
    };
  });
  
  agents.eventFinderAgent.tools.suggestMeetingTimes.bind(async (state, input) => {
    const { participants, duration, earliestDate, latestDate, workingHoursStart, workingHoursEnd } = input;
    
    // This is a simplified version - in a real implementation, this would be much more complex
    // and would account for working hours, timezones, and existing events
    
    // Get working hours for all participants if none specified
    const defaultStart = workingHoursStart || "09:00";
    const defaultEnd = workingHoursEnd || "17:00";
    
    // Get all events for the participants in the date range
    const events = getEventsInDateRange(earliestDate, latestDate).filter(event => 
      participants.some(participant => event.participants.includes(participant))
    );
    
    // For this mock implementation, just suggest a few time slots
    const suggestedTimes = [
      {
        startDateTime: `${formatDate(earliestDate)}T${defaultStart}:00`,
        endDateTime: `${formatDate(earliestDate)}T${defaultEnd}:00`,
        participants: participants,
        conflictCount: 0
      },
      {
        startDateTime: `${formatDate(new Date(parseDate(earliestDate).getTime() + 86400000))}T${defaultStart}:00`,
        endDateTime: `${formatDate(new Date(parseDate(earliestDate).getTime() + 86400000))}T${defaultEnd}:00`,
        participants: participants,
        conflictCount: 0
      },
      {
        startDateTime: `${formatDate(new Date(parseDate(earliestDate).getTime() + 172800000))}T${defaultStart}:00`,
        endDateTime: `${formatDate(new Date(parseDate(earliestDate).getTime() + 172800000))}T${defaultEnd}:00`,
        participants: participants,
        conflictCount: 0
      }
    ];
    
    return {
      success: true,
      suggestedTimes
    };
  });
  
  agents.eventFinderAgent.tools.getFreeBusy.bind(async (state, input) => {
    const { participants, startDate, endDate } = input;
    
    // Get all events for the participants in the date range
    const events = getEventsInDateRange(startDate, endDate).filter(event => 
      participants.some(participant => event.participants.includes(participant))
    );
    
    // Create a map of busy times for each participant
    const busyTimes = {};
    
    participants.forEach(participant => {
      busyTimes[participant] = events
        .filter(event => event.participants.includes(participant))
        .map(event => ({
          startDateTime: event.startDateTime,
          endDateTime: event.endDateTime,
          eventId: event.id,
          title: event.title
        }));
    });
    
    return {
      success: true,
      busyTimes
    };
  });
  
  // Compile all agents
  console.log("Compiling agents...");
  await Promise.all(Object.values(agents).map(agent => agent.compile()));
  
  // Wait for agent discovery to complete
  console.log("Waiting for agent discovery...");
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log("Event planner system ready!");
  
  // Example usage scenario 1: Creating a new event
  const client = AgentClient();
  console.log("\nExample 1: Creating a new event");
  const createRequest = "I need to schedule a design review meeting next Monday at 2pm for 1 hour with the design team. Today is 11th May 2025.";
  
  console.log(`User request: "${createRequest}"`);
  const createResponse = await client.queryIo(natsIO, 'eventPlanner', 'plannerAgent', new Message({
    content: createRequest,
    session: {
      id: uuidv4(),
      userId: "alice@example.com"
    }
  }));
  
  console.log("Planner Agent Response:");
  console.log(createResponse.getContent());
  
  // Example usage scenario 2: Finding events with specific criteria
  console.log("\nExample 2: Searching for events");
  const searchRequest = "Show me all meetings with Bob next month. Today is october 2023.";
  
  console.log(`User request: "${searchRequest}"`);
  const searchResponse = await client.queryIo(natsIO, 'eventPlanner', 'eventFinderAgent', new Message({
    content: searchRequest,
    session: {
      id: uuidv4(),
      userId: "alice@example.com"
    }
  }));
  
  console.log("Event Finder Agent Response:");
  console.log(searchResponse.getContent());
  
  // Example usage scenario 3: Updating an event
  console.log("\nExample 3: Updating an event");
  const updateRequest = "Change the Weekly Team Meeting to start at 9:30am instead of 10am.";
  
  console.log(`User request: "${updateRequest}"`);
  const updateResponse = await client.queryIo(natsIO, 'eventPlanner', 'plannerAgent', new Message({
    content: updateRequest,
    session: {
      id: uuidv4(),
      userId: "alice@example.com"
    }
  }));
  
  console.log("Planner Agent Response:");
  console.log(updateResponse.getContent());
  
  // Example usage scenario 4: Finding scheduling conflicts
  console.log("\nExample 4: Finding scheduling conflicts");
  const conflictRequest = "Do I have any scheduling conflicts next week?";
  
  console.log(`User request: "${conflictRequest}"`);
  const conflictResponse = await client.queryIo(natsIO, 'eventPlanner', 'eventFinderAgent', new Message({
    content: conflictRequest,
    session: {
      id: uuidv4(),
      userId: "alice@example.com"
    }
  }));
  
  console.log("Event Finder Agent Response:");
  console.log(conflictResponse.getContent());
  
  console.log("\nEvent planner workflow complete!");
}

// Execute the demo
main().catch(error => {
  console.error("Error running event planner demo:", error);
}); 