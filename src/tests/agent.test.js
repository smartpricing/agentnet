import { jest } from '@jest/globals'    

import { Agent } from '../agent/agent';
import { ConfigurationError, CompilationError } from '../errors';

// Mock the AgentRuntime module
jest.mock('../agent/runtime.js', () => ({
  AgentRuntime: jest.fn(),
}));
// Import the mocked AgentRuntime to allow inspection (e.g. toHaveBeenCalledWith)
import { AgentRuntime } from '../agent/runtime.js';

describe('Agent Core Functionality', () => {
  let agentBuilder;
  let mockLlmApi;
  let mockStoreInstance;
  let mockIoInstance;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    agentBuilder = Agent();
    mockLlmApi = {
      getClient: jest.fn().mockResolvedValue({}),
      callModel: jest.fn().mockResolvedValue('llm_response'),
      // Adding mock prompt and onResponse as AgentRuntime might expect them if not deeply mocked
      prompt: jest.fn(),
      onResponse: jest.fn(),
    };
    mockStoreInstance = {
      connect: jest.fn().mockResolvedValue(true),
      // Add other methods if your store interactions become more complex in tests
    };
    mockIoInstance = {
      type: 'TestIO',
      // Mock other IO methods if needed by AgentRuntime or specific IO logic
    };
  });

  describe('Agent Factory & Defaults', () => {
    it('should create a new agent builder with default metadata', () => {
      expect(agentBuilder._config.metadata).toEqual({
        name: 'default',
        namespace: 'default',
        description: 'A default agent',
      });
    });

    it('should create a new agent builder with default runner config', () => {
      expect(agentBuilder._config.runner).toEqual({
        maxRuns: 10,
      });
    });

    it('should create a new agent builder with default hooks', () => {
      expect(typeof agentBuilder._config.on.prompt).toBe('function');
      expect(typeof agentBuilder._config.on.response).toBe('function');
      // Test the default behavior of hooks
      const testInput = "test input";
      expect(agentBuilder._config.on.prompt({}, testInput)).resolves.toBe(testInput);
      const testResult = "test result";
      expect(agentBuilder._config.on.response({}, [], testResult)).resolves.toBe(testResult);
    });
  });

  describe('setMetadata(metadata)', () => {
    it('should allow setting valid metadata', () => {
      const metadata = { name: 'testAgent', namespace: 'testSpace', description: 'A test agent' };
      agentBuilder.setMetadata(metadata);
      expect(agentBuilder._config.metadata).toEqual(metadata);
    });

    it('should merge with existing metadata, overwriting common fields', () => {
      agentBuilder.setMetadata({ name: 'initialName', customField: 'initialValue' });
      agentBuilder.setMetadata({ name: 'newName', description: 'newDescription' });
      expect(agentBuilder._config.metadata).toEqual({
        name: 'newName',
        namespace: 'default', // From initial defaults if not overridden
        description: 'newDescription',
        customField: 'initialValue'
      });
    });
    
    it('should throw ConfigurationError if metadata is null', () => {
      expect(() => agentBuilder.setMetadata(null)).toThrow(ConfigurationError);
      expect(() => agentBuilder.setMetadata(null)).toThrow('Metadata is required');
    });

    // Validations for name and namespace during compile are more prominent,
    // but direct setters could also enforce this, though current code doesn't.
    // If direct enforcement in setMetadata is desired, add tests here.
    // For now, these are primarily tested via compile's validation.
  });

  describe('withLLM(llmApi, llmConfig)', () => {
    it('should configure LLM with valid API and config', () => {
      const llmConfig = { model: 'test-model', temperature: 0.7 };
      agentBuilder.withLLM(mockLlmApi, llmConfig);
      expect(agentBuilder._config.llm.api).toBe(mockLlmApi);
      expect(agentBuilder._config.llm.config).toEqual(llmConfig);
    });

    it('should throw ConfigurationError if llmApi is null', () => {
      expect(() => agentBuilder.withLLM(null, {})).toThrow(ConfigurationError);
      expect(() => agentBuilder.withLLM(null, {})).toThrow('LLM API is required');
    });
    
    it('should throw ConfigurationError if llmApi is not an object (during compile)', async () => {
      agentBuilder.withLLM("notAnObject", {});
      await expect(agentBuilder.compile()).rejects.toThrow(new ConfigurationError("LLM API must be a valid object"));
    });

    it('should throw ConfigurationError if llmApi is missing getClient (during compile)', async () => {
      const invalidApi = { ...mockLlmApi };
      delete invalidApi.getClient;
      agentBuilder.withLLM(invalidApi, {});
      await expect(agentBuilder.compile()).rejects.toThrow(new ConfigurationError("LLM API must have a getClient method"));
    });

    it('should throw ConfigurationError if llmApi is missing callModel (during compile)', async () => {
      const invalidApi = { ...mockLlmApi };
      delete invalidApi.callModel;
      agentBuilder.withLLM(invalidApi, {});
      await expect(agentBuilder.compile()).rejects.toThrow(new ConfigurationError("LLM API must have a callModel method"));
    });
  });

  describe('withStore(storeInstance, storeConfig)', () => {
    it('should configure store with valid instance and config', () => {
      const storeConfig = { type: 'test-store' };
      agentBuilder.withStore(mockStoreInstance, storeConfig);
      expect(agentBuilder._config.store.instance).toBe(mockStoreInstance);
      expect(agentBuilder._config.store.config).toEqual(storeConfig);
    });

    it('should throw ConfigurationError if storeInstance is null', () => {
      expect(() => agentBuilder.withStore(null, {})).toThrow(ConfigurationError);
      expect(() => agentBuilder.withStore(null, {})).toThrow('Store instance is required');
    });

    it('should throw ConfigurationError if storeInstance is not an object (during compile)', async () => {
      agentBuilder.withLLM(mockLlmApi, {}); // Need LLM for compilation
      agentBuilder.withStore("notAnObject", {});
      await expect(agentBuilder.compile()).rejects.toThrow(new ConfigurationError("Store instance must be a valid object"));
    });
    
    it('should throw ConfigurationError if storeInstance is missing connect (during compile)', async () => {
      const invalidStore = {}; // Missing connect
      agentBuilder.withLLM(mockLlmApi, {});
      agentBuilder.withStore(invalidStore, {});
      await expect(agentBuilder.compile()).rejects.toThrow(new ConfigurationError("Store instance must have a connect method"));
    });
  });

  describe('addIO(instance, ioConfig)', () => {
    it('should add IO interface with valid instance and config', () => {
      const ioConfig = { setting: 'test-setting' };
      agentBuilder.addIO(mockIoInstance, ioConfig);
      expect(agentBuilder._config.io[0].type).toBe(mockIoInstance.type);
      expect(agentBuilder._config.io[0].instance).toBe(mockIoInstance);
      expect(agentBuilder._config.io[0].config).toEqual(ioConfig);
    });

    it('should throw ConfigurationError if instance is null', () => {
      expect(() => agentBuilder.addIO(null, {})).toThrow(ConfigurationError);
      expect(() => agentBuilder.addIO(null, {})).toThrow('IO instance must have a type');
    });

    it('should throw ConfigurationError if instance.type is missing', () => {
      expect(() => agentBuilder.addIO({}, {})).toThrow(ConfigurationError);
      expect(() => agentBuilder.addIO({}, {})).toThrow('IO instance must have a type');
    });
    
    // Further IO validation (missing instance/config on compile) is tested in compile section
  });

  describe('addToolSchema(schema)', () => {
    it('should add a valid tool schema', () => {
      const toolSchema = { name: 'testTool', description: 'A tool for testing' };
      agentBuilder.addToolSchema(toolSchema);
      expect(agentBuilder._config.toolsSchemas['testTool']).toEqual(toolSchema);
    });

    it('should throw ConfigurationError if schema is null', () => {
      expect(() => agentBuilder.addToolSchema(null)).toThrow(ConfigurationError);
      expect(() => agentBuilder.addToolSchema(null)).toThrow('Tool schema must have a name');

    });

    it('should throw ConfigurationError if schema.name is missing', () => {
      expect(() => agentBuilder.addToolSchema({ description: ' nameless tool' })).toThrow(ConfigurationError);
      expect(() => agentBuilder.addToolSchema({ description: ' nameless tool' })).toThrow('Tool schema must have a name');
    });
  });

  describe('addDiscoverySchema(schema)', () => {
    it('should add a valid discovery schema', () => {
      const discoverySchema = { name: 'testDiscovery', description: 'For discovering things' };
      agentBuilder.addDiscoverySchema(discoverySchema);
      expect(agentBuilder._config.discoverySchemas).toContainEqual(discoverySchema);
    });

    it('should throw ConfigurationError if schema is null', () => {
      expect(() => agentBuilder.addDiscoverySchema(null)).toThrow(ConfigurationError);
      expect(() => agentBuilder.addDiscoverySchema(null)).toThrow('Discovery schema is required');
    });
  });

  describe('on(eventName, handler)', () => {
    it('should register custom prompt and response handlers', () => {
      const mockPromptFn = jest.fn();
      const mockResponseFn = jest.fn();
      agentBuilder.on('prompt', mockPromptFn);
      agentBuilder.on('response', mockResponseFn);
      expect(agentBuilder._config.on.prompt).toBe(mockPromptFn);
      expect(agentBuilder._config.on.response).toBe(mockResponseFn);
    });

    it('should throw ConfigurationError if handler is not a function', () => {
      expect(() => agentBuilder.on('prompt', 'not-a-function')).toThrow(ConfigurationError);
      expect(() => agentBuilder.on('prompt', 'not-a-function')).toThrow('Event handler for prompt must be a function');
    });
  });

  describe('getToolsSchemas()', () => {
    it('should return a copy of tool schemas', () => {
      const toolSchema1 = { name: 'tool1', description: 'Tool one' };
      const toolSchema2 = { name: 'tool2', description: 'Tool two' };
      agentBuilder.addToolSchema(toolSchema1);
      agentBuilder.addToolSchema(toolSchema2);

      const retrievedSchemas = agentBuilder.getToolsSchemas();
      expect(retrievedSchemas).toEqual({ tool1: toolSchema1, tool2: toolSchema2 });
      // Ensure it's a copy
      retrievedSchemas.tool1.description = "modified";
      expect(agentBuilder._config.toolsSchemas.tool1.description).toBe("Tool one");
    });

    it('should return an empty object if no tools are added', () => {
      expect(agentBuilder.getToolsSchemas()).toEqual({});
    });
  });

  describe('compile()', () => {
    beforeEach(() => {
      // Minimum valid config for most compile tests
      agentBuilder.withLLM(mockLlmApi, { model: 'test-model' });
      agentBuilder.setMetadata({ name: 'compileAgent', namespace: 'compileSpace' });
    });

    it('should successfully compile with minimal valid configuration', async () => {
      AgentRuntime.mockResolvedValue({ query: jest.fn() });
      const compiledAgent = await agentBuilder.compile();
      expect(AgentRuntime).toHaveBeenCalledTimes(1);
      expect(AgentRuntime).toHaveBeenCalledWith(agentBuilder._config); // Check if called with the correct config
      expect(compiledAgent).toBeDefined();
      expect(typeof compiledAgent.query).toBe('function');
    });
    
    it('should throw ConfigurationError if metadata.name is empty during compile', async () => {
      agentBuilder.setMetadata({ name: '', namespace: 'test' });
      await expect(agentBuilder.compile()).rejects.toThrow(new ConfigurationError("Agent name cannot be empty"));
    });
    
    it('should throw ConfigurationError if metadata.namespace is empty during compile', async () => {
      agentBuilder.setMetadata({ name: 'test', namespace: '  ' }); // Whitespace
      await expect(agentBuilder.compile()).rejects.toThrow(new ConfigurationError("Agent namespace cannot be empty"));
    });

    it('should throw ConfigurationError if LLM is not configured', async () => {
      const freshAgent = Agent(); // No LLM
      freshAgent.setMetadata({ name: 'noLlmAgent', namespace: 'test' });
      await expect(freshAgent.compile()).rejects.toThrow(ConfigurationError);
      // The schema validation might throw a generic "is required" or a more specific one based on schema order
      // For AGENT_CONFIG_SCHEMA, 'llm' is required.
    });
    
    it('should throw ConfigurationError if an added IO interface has no instance (during compile)', async () => {
      agentBuilder._config.io.push({ type: 'BadIO', config: {} /* no instance */});
      await expect(agentBuilder.compile()).rejects.toThrow(new ConfigurationError("IO interface BadIO at index 0 has no instance"));
    });

    it('should throw ConfigurationError if an added IO interface has no config (during compile)', async () => {
      agentBuilder._config.io.push({ type: 'BadIO', instance: mockIoInstance /* no config */});
      await expect(agentBuilder.compile()).rejects.toThrow(new ConfigurationError("IO interface BadIO at index 0 has no configuration"));
    });
    
    it('should throw ConfigurationError if a tool schema is invalid (e.g., name missing, checked during compile)', async () => {
      // Note: addToolSchema checks this, but validateConfiguration re-checks.
      // This test ensures validateConfiguration's check works.
      agentBuilder._config.toolsSchemas['badTool'] = { description: "I am bad" }; // No name in schema value
      await expect(agentBuilder.compile()).rejects.toThrow(new ConfigurationError("Tool schema must have a name"));
    });

    it('should throw ConfigurationError if runner.maxRuns is not a positive number', async () => {
      agentBuilder._config.runner.maxRuns = 0;
      await expect(agentBuilder.compile()).rejects.toThrow(new ConfigurationError("runner.maxRuns must be greater than 0"));
      agentBuilder._config.runner.maxRuns = -1;
      await expect(agentBuilder.compile()).rejects.toThrow(new ConfigurationError("runner.maxRuns must be greater than 0"));
      agentBuilder._config.runner.maxRuns = 'not a number';
      await expect(agentBuilder.compile()).rejects.toThrow(new ConfigurationError("Invalid type for runner.maxRuns in agent_config: expected number, got string"));
    });
    
    it('should throw ConfigurationError if an event handler is not a function', async () => {
      agentBuilder._config.on.prompt = "not a function";
      await expect(agentBuilder.compile()).rejects.toThrow(new ConfigurationError("Event handler for 'prompt' must be a function"));
    });

    it('should throw CompilationError if AgentRuntime throws an error', async () => {
      const runtimeError = new Error('Runtime failed!');
      AgentRuntime.mockRejectedValue(runtimeError);
      await expect(agentBuilder.compile()).rejects.toThrow(CompilationError);
      await expect(agentBuilder.compile()).rejects.toThrow(`Failed to compile agent ${agentBuilder._config.metadata.name}: ${runtimeError.message}`);
    });

    it('should pass full configuration to AgentRuntime', async () => {
      const toolSchema = { name: 'myTool', parameters: {} };
      const discoverySchema = { name: 'myDiscovery' };
      const ioConfig = { network: 'testNet' };
      const storeConfig = { db: 'testDb' };
      const promptHook = jest.fn();
      const responseHook = jest.fn();

      agentBuilder
        .addToolSchema(toolSchema)
        .addDiscoverySchema(discoverySchema)
        .addIO(mockIoInstance, ioConfig)
        .withStore(mockStoreInstance, storeConfig)
        .on('prompt', promptHook)
        .on('response', responseHook);
      
      AgentRuntime.mockResolvedValue({ query: jest.fn() });
      await agentBuilder.compile();

      expect(AgentRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: agentBuilder._config.metadata,
          llm: agentBuilder._config.llm,
          store: agentBuilder._config.store,
          io: expect.arrayContaining([expect.objectContaining({ type: mockIoInstance.type, instance: mockIoInstance, config: ioConfig })]),
          toolsSchemas: expect.objectContaining({ 'myTool': toolSchema }),
          discoverySchemas: expect.arrayContaining([discoverySchema]),
          on: expect.objectContaining({ prompt: promptHook, response: responseHook }),
          runner: agentBuilder._config.runner
        })
      );
    });
  });
}); 