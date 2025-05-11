# Event Planner Multiagent System

This example demonstrates a calendar management and event planning system built with multiple agents that collaborate to help users manage their schedules.

## Overview

The system consists of two specialized agents:

1. **Planner Agent**: Handles calendar event management (create, read, update, delete) and availability checking.
2. **Event Finder Agent**: Specializes in searching for events, identifying scheduling conflicts, and suggesting optimal meeting times.

## Architecture

- Agents are defined declaratively in YAML with specialized system instructions, tools, and discovery schemas.
- Agents communicate with each other through NATS as the transport mechanism.
- The system maintains a shared session context to track user interactions.
- Tool implementations provide the actual calendar functionality with mock data.

## Key Features

The event planner system demonstrates several important capabilities:

### Planner Agent Features:
- Creating new calendar events with titles, dates, times, descriptions, locations, and participants
- Listing events within a specified date range
- Retrieving detailed information about specific events
- Updating existing events (changing title, time, location, etc.)
- Deleting events from the calendar
- Checking availability for potential time slots

### Event Finder Agent Features:
- Searching for events based on various criteria (keywords, dates, participants, locations)
- Finding scheduling conflicts between events
- Suggesting optimal meeting times based on participant availability
- Providing free/busy information for participants

## Mock Data

For demonstration purposes, this example includes mock data for:
- Calendar events with details like title, time, location, participants
- User information including working hours and time zones

In a production environment, these would be connected to real calendar APIs and databases.

## Running the Example

To run this example:

```bash
node examples/event-planner/index.js
```

## Example Workflows

The code demonstrates several workflow scenarios:

1. **Creating a new event**: The user requests to schedule a meeting, and the planner agent creates the appropriate calendar entry.
2. **Searching for events**: The user asks to find events matching specific criteria, and the event finder agent returns relevant results.
3. **Updating an event**: The user requests a change to an existing event, and the planner agent makes the appropriate updates.
4. **Finding scheduling conflicts**: The user asks about potential conflicts, and the event finder agent identifies and reports them.

## Extending the Example

You can extend this example by:
- Adding more specialized agents (e.g., a reminder agent, a travel planning agent)
- Implementing real calendar API connections (Google Calendar, Microsoft Outlook, etc.)
- Enhancing the scheduling algorithm to better account for time zones and working hours
- Adding natural language processing capabilities for more flexible date/time inputs
- Creating a user interface for calendar visualization 