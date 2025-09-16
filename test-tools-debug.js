import { Agent, GPT, Message, MemoryStore } from "./src/index.js"

// Test to debug the tools array issue
async function testToolsFormat() {
    console.log("=== Testing Tools Format ===\n");
    
    // Create a simple agent with one tool
    const agent = Agent()
        .setMetadata({
            name: "testAgent",
            namespace: "test"
        })
        .withLLM(GPT, {
            model: "gpt-4o-mini",
            instructions: "You are a test agent."
        })
        .withStore(MemoryStore(), {})
        .addTool({
            name: "test_tool",
            description: "A test tool",
            type: "function",
            parameters: {
                type: "object",
                properties: {
                    input: {
                        type: "string",
                        description: "Test input"
                    }
                },
                required: ["input"]
            }
        }, async (state, input) => {
            return { result: "test" }
        });
    
    // Check the internal structure
    console.log("1. Agent config toolsSchemas:");
    console.log(JSON.stringify(agent._config.toolsSchemas, null, 2));
    
    console.log("\n2. Agent config toolsAndHandoffsMap:");
    console.log(JSON.stringify(agent._config.toolsAndHandoffsMap, null, 2));
    
    // Now let's see what Object.values gives us
    console.log("\n3. Object.values(toolsSchemas):");
    const toolsArray = Object.values(agent._config.toolsSchemas);
    console.log(JSON.stringify(toolsArray, null, 2));
    
    // Check what each tool looks like
    console.log("\n4. First tool structure:");
    if (toolsArray.length > 0) {
        const firstTool = toolsArray[0];
        console.log("Type of first tool:", typeof firstTool);
        console.log("First tool keys:", Object.keys(firstTool));
        console.log("First tool:", JSON.stringify(firstTool, (key, value) => {
            if (typeof value === 'function') return '[Function]';
            return value;
        }, 2));
    }
    
    // Simulate what makeToolsAndHandoffsMap would do
    console.log("\n5. Simulating makeToolsAndHandoffsMap:");
    const simulatedMap = { tools: [] };
    for (const tool of toolsArray) {
        if (!tool.schema) {
            console.log("  - Tool has no schema, pushing tool itself");
            simulatedMap.tools.push(tool);
        } else {
            console.log("  - Tool has schema, pushing tool.schema");
            simulatedMap.tools.push(tool.schema);
        }
    }
    console.log("Simulated tools array:", JSON.stringify(simulatedMap.tools, null, 2));
    
    console.log("\n=== End Test ===");
}

// Run the test
testToolsFormat().catch(console.error);
