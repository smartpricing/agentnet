import { AgentLoaderFile, Message, Bindings, NatsIO, MemoryStore, AgentClient } from "../../src/index.js";
import { v4 as uuidv4 } from 'uuid';

// Mock database for demonstration purposes
const mockDatabase = {
  products: {
    "prod-001": {
      name: "SuperWidget Pro",
      features: "Advanced automation, Smart connectivity, Voice control",
      specs: "Dimensions: 10x5x2cm, Weight: 200g, Battery life: 48 hours",
      compatibility: "Works with iOS 14+, Android 10+, Windows 10"
    },
    "prod-002": {
      name: "MegaGadget Plus",
      features: "Touch display, Water-resistant, Motion sensing",
      specs: "Dimensions: 15x8x3cm, Weight: 350g, Battery life: 36 hours",
      compatibility: "Works with iOS 13+, Android 9+, MacOS 11+"
    },
    "prod-003": {
      name: "TechTool Ultimate",
      features: "Remote diagnostics, Predictive maintenance, Cloud backup",
      specs: "Dimensions: 20x12x5cm, Weight: 500g, Power: 110-240V",
      compatibility: "Compatible with all major operating systems and smart home hubs"
    }
  },
  customers: {
    "cust-001": {
      name: "Jane Smith",
      email: "jane.smith@example.com",
      accountType: "Premium",
      subscriptionStatus: "Active",
      paymentHistory: [
        { date: "2023-09-15", amount: "$49.99", status: "Paid" },
        { date: "2023-08-15", amount: "$49.99", status: "Paid" }
      ]
    },
    "cust-002": {
      name: "John Doe",
      email: "john.doe@example.com",
      accountType: "Basic",
      subscriptionStatus: "Trial",
      paymentHistory: [
        { date: "2023-09-10", amount: "$0.00", status: "Trial" }
      ]
    }
  },
  knownIssues: [
    {
      id: "KI-001",
      productId: "prod-001",
      symptoms: ["won't power on", "battery drain", "charging issue"],
      solution: "Check charging cable and ensure battery is properly seated. If problem persists, try a factory reset by holding power + volume down for 10 seconds."
    },
    {
      id: "KI-002",
      productId: "prod-002",
      symptoms: ["screen flickering", "display issues", "touch not responsive"],
      solution: "Update to the latest firmware version. If problem persists, perform a soft reset by holding power for 5 seconds."
    }
  ],
  supportCases: {
    "case-001": {
      customerId: "cust-001",
      productId: "prod-001",
      status: "resolved",
      issue: "Device won't connect to WiFi",
      resolution: "Guided customer through network reset procedure",
      agentNotes: "Customer was satisfied with the resolution"
    },
    "case-002": {
      customerId: "cust-002",
      productId: "prod-003",
      status: "pending",
      issue: "Software crashes during data backup",
      resolution: null,
      agentNotes: "Escalated to technical team for investigation"
    }
  }
};

// Set up the NATS instance for inter-agent communication
const natsIO = NatsIO();

// Helper function to generate a unique case ID
function generateCaseId() {
  return `case-${uuidv4().substring(0, 6)}`;
}

// Main function to set up and demonstrate the customer support system
async function main() {
  console.log("Loading customer support agents...");
  
  // Load all agents from the YAML file
  const agents = await AgentLoaderFile('./examples/customer-support/agents.yaml', {
    bindings: { [Bindings.NatsIO]: natsIO, [Bindings.Memory]: MemoryStore() }
  });
  
  // Bind tool implementations for Triage Agent
  agents.triageAgent.tools.categorizeQuery.bind(async (state, input) => {
    const query = input.query.toLowerCase();
    
    if (query.includes("price") || query.includes("subscription") || query.includes("refund") || query.includes("payment")) {
      return { category: "billing" };
    } else if (query.includes("not working") || query.includes("error") || query.includes("broken") || query.includes("issue")) {
      return { category: "technical" };
    } else if (query.includes("feature") || query.includes("compatible") || query.includes("specs") || query.includes("model")) {
      return { category: "product" };
    } else {
      return { category: "complex" };
    }
  });
  
  agents.triageAgent.tools.routeToAgent.bind(async (state, input) => {
    const { category, queryId } = input;
    const routingMap = {
      "product": "productAgent",
      "technical": "technicalAgent",
      "billing": "billingAgent",
      "complex": "escalationAgent"
    };
    
    const targetAgent = routingMap[category] || "escalationAgent";
    
    console.log(`Routing query ${queryId} to ${targetAgent} (category: ${category})`);
    
    return {
      success: true,
      routedTo: targetAgent,
      message: `Your query has been routed to our ${category} specialist.`
    };
  });
  
  // Bind tool implementations for Product Agent
  agents.productAgent.tools.getProductInfo.bind(async (state, input) => {
    const { productId, infoType } = input;
    const product = mockDatabase.products[productId];
    
    if (!product) {
      return { error: "Product not found" };
    }
    
    if (infoType && product[infoType]) {
      return { 
        productName: product.name,
        [infoType]: product[infoType]
      };
    }
    
    return product;
  });
  
  agents.productAgent.tools.compareProducts.bind(async (state, input) => {
    const { productIds } = input;
    const comparisonResults = {};
    
    for (const productId of productIds) {
      const product = mockDatabase.products[productId];
      if (product) {
        comparisonResults[productId] = {
          name: product.name,
          features: product.features,
          specs: product.specs
        };
      }
    }
    
    return { comparison: comparisonResults };
  });
  
  // Bind tool implementations for Technical Agent
  agents.technicalAgent.tools.troubleshootIssue.bind(async (state, input) => {
    const { issueDescription, productId } = input;
    
    // Simple troubleshooting logic based on keywords
    if (issueDescription.toLowerCase().includes("won't power on")) {
      return {
        steps: [
          "Ensure the device is charged or has fresh batteries",
          "Try a different power outlet or charging cable",
          "Press and hold the power button for 10 seconds",
          "If none of these work, the device may need servicing"
        ]
      };
    } else if (issueDescription.toLowerCase().includes("connection") || issueDescription.toLowerCase().includes("wifi")) {
      return {
        steps: [
          "Restart your router and the device",
          "Make sure the device is within range of the WiFi signal",
          "Check if other devices can connect to the same network",
          "Reset network settings on the device"
        ]
      };
    } else {
      return {
        steps: [
          "Restart the device",
          "Check for software updates",
          "Reset to factory settings if problems persist",
          "Contact technical support for further assistance"
        ]
      };
    }
  });
  
  agents.technicalAgent.tools.checkKnownIssues.bind(async (state, input) => {
    const { symptoms, productId } = input;
    
    const matchedIssues = mockDatabase.knownIssues.filter(issue => {
      if (productId && issue.productId !== productId) {
        return false;
      }
      
      // Check if any of the symptoms match
      return issue.symptoms.some(symptom => 
        symptoms.some(s => symptom.includes(s.toLowerCase()))
      );
    });
    
    if (matchedIssues.length > 0) {
      return {
        matchFound: true,
        issues: matchedIssues.map(issue => ({
          id: issue.id,
          solution: issue.solution
        }))
      };
    } else {
      return {
        matchFound: false,
        message: "No known issues match the described symptoms."
      };
    }
  });
  
  // Bind tool implementations for Billing Agent
  agents.billingAgent.tools.getAccountInfo.bind(async (state, input) => {
    const { customerId, infoType } = input;
    const customer = mockDatabase.customers[customerId];
    
    if (!customer) {
      return { error: "Customer not found" };
    }
    
    if (infoType === "paymentHistory") {
      return { paymentHistory: customer.paymentHistory };
    } else if (infoType === "subscription") {
      return {
        accountType: customer.accountType,
        subscriptionStatus: customer.subscriptionStatus
      };
    } else {
      // Return safe information, omitting sensitive details
      return {
        name: customer.name,
        email: customer.email,
        accountType: customer.accountType,
        subscriptionStatus: customer.subscriptionStatus
      };
    }
  });
  
  agents.billingAgent.tools.processRefund.bind(async (state, input) => {
    const { orderId, reason, fullRefund } = input;
    
    // This would connect to payment processor in real implementation
    return {
      refundId: `ref-${Date.now().toString().substr(-6)}`,
      status: "processed",
      amount: fullRefund ? "Full amount" : "Partial amount",
      estimatedCompletion: "3-5 business days"
    };
  });
  
  // Bind tool implementations for Escalation Agent
  agents.escalationAgent.tools.analyzeComplexIssue.bind(async (state, input) => {
    const { issueDescription, previousAttempts } = input;
    
    return {
      analysisResult: "Complex issue identified and logged for specialized handling",
      priority: "High",
      estimatedResolutionTime: "24-48 hours",
      caseId: `esc-${Date.now().toString().substr(-6)}`
    };
  });
  
  agents.escalationAgent.tools.createSpecializedSolution.bind(async (state, input) => {
    const { issueId, approachType } = input;
    
    return {
      solution: "Custom solution plan created for your specific issue",
      steps: [
        "Schedule a dedicated technical specialist session",
        "Perform advanced diagnostics on your device",
        "Apply customized fixes based on your specific configuration",
        "Follow up to ensure complete resolution"
      ],
      supportContact: "escalation@example.com"
    };
  });
  
  // Bind tool implementations for Follow-up Agent
  agents.followupAgent.tools.checkResolutionStatus.bind(async (state, input) => {
    const { caseId } = input;
    const supportCase = mockDatabase.supportCases[caseId];
    
    if (!supportCase) {
      return {
        found: false,
        message: "Case not found in our records"
      };
    }
    
    return {
      found: true,
      status: supportCase.status,
      resolution: supportCase.resolution
    };
  });
  
  agents.followupAgent.tools.recordFeedback.bind(async (state, input) => {
    const { caseId, feedbackType, feedbackContent } = input;
    
    // In a real implementation, this would store the feedback in a database
    console.log(`Feedback recorded for case ${caseId}: ${feedbackType} - ${feedbackContent}`);
    
    return {
      success: true,
      message: "Thank you for your feedback. It helps us improve our service."
    };
  });
  
  // Compile all agents
  console.log("Compiling agents...");
  await Promise.all(Object.values(agents).map(agent => agent.compile()));
  
  // Wait for agent discovery to complete
  console.log("Waiting for agent discovery...");
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log("Customer support network ready!");
  
  // Example usage scenario
  const customerQuery = "My SuperWidget Pro won't turn on after charging it overnight.";
  console.log(`\nProcessing customer query: "${customerQuery}"`);
  
  // Generate a case ID for this interaction
  const caseId = generateCaseId();
  console.log(`Generated case ID: ${caseId}`);
  
  // Start with the triage agent
  const client = AgentClient();
  const res = await client.queryIo(natsIO, 'customerSupport.triageAgent', new Message({
    content: customerQuery,
    session: {
      id: caseId,
      customerId: "cust-001",
      productId: "prod-001"
    }
  }))
  
  console.log("\nTriage Agent Response:");
  console.log(res.getContent());
  
  // For demonstration purposes, let's simulate a complete flow through the technical agent
  console.log("\nRouting to Technical Agent...");
  const res2 = await client.queryIo(natsIO, 'customerSupport.technicalAgent', new Message({
    content: customerQuery,
    session: {
        id: caseId,
        customerId: "cust-001",
        productId: "prod-001"
      }
    })  
  );
  
  console.log("Technical Agent Response:");
  console.log(res2.getContent());
  
  // Simulate storing the case resolution
  mockDatabase.supportCases[caseId] = {
    customerId: "cust-001",
    productId: "prod-001",
    status: "resolved",
    issue: customerQuery,
    resolution: "Guided customer through power cycle and battery check",
    agentNotes: "Issue resolved successfully"
  };
  
  // Now follow up with the customer
  console.log("\nFollowing up with customer after resolution...");
  const res3 = await client.queryIo(natsIO, 'customerSupport.followupAgent', new Message({
    content: `Please follow up on case ${caseId}`,
      session: {
        id: caseId
      }
    })
  );
  
  console.log("Follow-up Agent Response:");
  console.log(res3.getContent());
  
  console.log("\nCustomer support workflow complete!");
}

// Execute the demo
main().catch(error => {
  console.error("Error running customer support demo:", error);
}); 