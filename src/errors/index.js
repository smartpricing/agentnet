/**
 * Base error class for all SmartAgent errors
 */
export class SmartAgentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SmartAgentError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Configuration related errors
 */
export class ConfigurationError extends SmartAgentError {
  constructor(message, configContext = {}) {
    super(message);
    this.name = 'ConfigurationError';
    this.configContext = configContext;
  }
}

/**
 * Tool execution related errors
 */
export class ToolExecutionError extends SmartAgentError {
  constructor(message, toolName, input, cause = null) {
    super(message);
    this.name = 'ToolExecutionError';
    this.toolName = toolName;
    this.input = input;
    this.cause = cause;
  }
}

/**
 * Transport/IO related errors
 */
export class TransportError extends SmartAgentError {
  constructor(message, transportType, details = {}) {
    super(message);
    this.name = 'TransportError';
    this.transportType = transportType;
    this.details = details;
  }
}

/**
 * Errors related to LLM API calls
 */
export class LLMError extends SmartAgentError {
  constructor(message, provider, details = {}) {
    super(message);
    this.name = 'LLMError';
    this.provider = provider;
    this.details = details;
  }
}

/**
 * Errors related to agent discovery
 */
export class DiscoveryError extends SmartAgentError {
  constructor(message, discoveryContext = {}) {
    super(message);
    this.name = 'DiscoveryError';
    this.discoveryContext = discoveryContext;
  }
}

/**
 * Errors related to agent handoffs
 */
export class HandoffError extends SmartAgentError {
  constructor(message, sourceAgent, targetAgent, payload = {}) {
    super(message);
    this.name = 'HandoffError';
    this.sourceAgent = sourceAgent;
    this.targetAgent = targetAgent;
    this.payload = payload;
  }
}

/**
 * Errors during agent compilation
 */
export class CompilationError extends SmartAgentError {
  constructor(message, agentName, cause = null) {
    super(message);
    this.name = 'CompilationError';
    this.agentName = agentName;
    this.cause = cause;
  }
}

/**
 * Validation errors
 */
export class ValidationError extends SmartAgentError {
  constructor(message, errors = []) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/**
 * Timeouts in agent operations
 */
export class TimeoutError extends SmartAgentError {
  constructor(message, operation, timeoutMs) {
    super(message);
    this.name = 'TimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Helper to wrap async functions with timeout
 * @param {Function} fn - Async function to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Name of the operation for error context
 */
export async function withTimeout(fn, timeoutMs, operationName) {
  let timeoutId;
  
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(
        `Operation '${operationName}' timed out after ${timeoutMs}ms`,
        operationName,
        timeoutMs
      ));
    }, timeoutMs);
  });
  
  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Helper for retrying operations with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 */
export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 300,
    maxDelayMs = 5000,
    retryableErrors = [TransportError, TimeoutError],
    onRetry = () => {}
  } = options;
  
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      const isRetryable = retryableErrors.some(ErrorClass => 
        error instanceof ErrorClass
      );
      
      if (!isRetryable || attempt >= maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        baseDelayMs * 2 ** attempt * (0.75 + Math.random() * 0.5),
        maxDelayMs
      );
      
      // Call onRetry callback
      onRetry({
        error,
        attempt: attempt + 1,
        maxRetries,
        delayMs: delay
      });
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
} 