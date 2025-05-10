# Customer Support Multiagent System

This example demonstrates a comprehensive customer support system built with multiple specialized agents that collaborate to handle customer inquiries.

## Overview

The system consists of six specialized agents:

1. **Triage Agent**: Greets customers, analyzes their query, and routes them to the appropriate specialist agent.
2. **Product Agent**: Answers questions about product features, specifications, and compatibility.
3. **Technical Agent**: Helps troubleshoot technical issues and provides step-by-step instructions.
4. **Billing Agent**: Handles payment-related inquiries, subscription questions, and refund requests.
5. **Escalation Agent**: Addresses complex issues that cannot be handled by other specialized agents.
6. **Follow-up Agent**: Checks in with customers after resolution to ensure satisfaction.

## Architecture

- Each agent is defined declaratively in YAML with its own system instructions, tools, and discovery schemas.
- Agents communicate with each other through NATS as the transport mechanism.
- The system maintains a shared session context to track customer interactions across agents.
- Tool implementations are bound to each agent to provide the actual functionality.

## How It Works

1. When a customer submits a query, it is first processed by the Triage Agent.
2. The Triage Agent categorizes the query and routes it to the appropriate specialist agent.
3. The specialist agent uses its tools to gather information and provide a solution.
4. For complex issues, escalation to a higher-tier agent is possible.
5. Once the issue is resolved, the Follow-up Agent checks in with the customer.

## Mock Data

For demonstration purposes, this example includes mock data for:
- Product information
- Customer accounts
- Known technical issues
- Support case histories

In a production environment, these would be connected to real databases and APIs.

## Running the Example

To run this example:

```bash
node examples/customer-support/index.js
```

## Example Workflow

The code demonstrates a complete workflow through these stages:

1. Customer query: "My SuperWidget Pro won't turn on after charging it overnight."
2. Triage Agent categorizes this as a technical issue.
3. Technical Agent provides troubleshooting steps.
4. The issue is marked as resolved in the system.
5. Follow-up Agent checks in to ensure customer satisfaction.

## Extending the Example

You can extend this example by:
- Adding more specialized agents
- Implementing real database connections
- Adding authentication and authorization
- Creating a user interface for customers
- Integrating with existing support ticketing systems 