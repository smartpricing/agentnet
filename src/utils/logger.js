/**
 * Logging levels
 */
export const LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  TRACE: 'trace'
};

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG = {
  level: LogLevel.INFO,
  enableTimestamps: true,
  enableColors: true,
  redactSensitiveData: true,
  sensitiveKeys: ['api_key', 'key', 'token', 'password', 'secret', 'credential'],
  maxOutputLength: 1000
};

// ANSI color codes for console output
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

/**
 * Formats log message with timestamp and level
 */
function formatLogMessage(level, message, config) {
  let output = '';
  
  // Add timestamp
  if (config.enableTimestamps) {
    const timestamp = new Date().toISOString();
    output += config.enableColors ? `${COLORS.gray}${timestamp}${COLORS.reset} ` : `${timestamp} `;
  }
  
  // Add log level
  if (config.enableColors) {
    const levelColor = {
      [LogLevel.ERROR]: COLORS.red,
      [LogLevel.WARN]: COLORS.yellow,
      [LogLevel.INFO]: COLORS.green,
      [LogLevel.DEBUG]: COLORS.blue,
      [LogLevel.TRACE]: COLORS.gray
    }[level] || COLORS.reset;
    
    output += `${levelColor}[${level.toUpperCase()}]${COLORS.reset} `;
  } else {
    output += `[${level.toUpperCase()}] `;
  }
  
  // Add message
  output += message;
  
  return output;
}

/**
 * Redacts sensitive data in objects
 */
function redactSensitiveData(data, sensitiveKeys) {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item, sensitiveKeys));
  }
  
  // Clone the object to avoid modifying the original
  const result = { ...data };
  
  for (const key in result) {
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      // Check if key name contains any sensitive patterns
      const isSensitive = sensitiveKeys.some(pattern => 
        key.toLowerCase().includes(pattern.toLowerCase())
      );
      
      if (isSensitive) {
        // Redact the value
        result[key] = '[REDACTED]';
      } else if (typeof result[key] === 'object' && result[key] !== null) {
        // Recursively process nested objects
        result[key] = redactSensitiveData(result[key], sensitiveKeys);
      }
    }
  }
  
  return result;
}

/**
 * Safely stringifies objects for logging
 */
function safeStringify(obj, maxLength) {
  try {
    if (obj instanceof Error) {
      return obj.stack || obj.message;
    }
    
    if (typeof obj === 'object' && obj !== null) {
      let str = JSON.stringify(obj, null, 2);
      if (maxLength && str.length > maxLength) {
        str = str.substring(0, maxLength) + '... [truncated]';
      }
      return str;
    }
    
    return String(obj);
  } catch (err) {
    return `[Unstringifiable Object: ${err.message}]`;
  }
}

/**
 * Creates a logger instance
 */
export function createLogger(customConfig = {}) {
  const config = { ...DEFAULT_CONFIG, ...customConfig };
  
  // Log level priority map
  const levelPriority = {
    [LogLevel.ERROR]: 0,
    [LogLevel.WARN]: 1,
    [LogLevel.INFO]: 2,
    [LogLevel.DEBUG]: 3,
    [LogLevel.TRACE]: 4
  };
  
  /**
   * Internal logging function
   */
  function log(level, message, data = {}) {
    // Check if this log level should be shown
    if (levelPriority[level] > levelPriority[config.level]) {
      return;
    }
    
    // Handle error objects
    if (message instanceof Error) {
      data.stack = message.stack;
      message = message.message;
    }
    
    // Redact sensitive data if configured
    let processedData = data;
    if (config.redactSensitiveData && typeof data === 'object') {
      processedData = redactSensitiveData(data, config.sensitiveKeys);
    }
    
    // Format the basic message
    let logMessage = formatLogMessage(level, message, config);
    
    // Add contextual data if available
    if (processedData && Object.keys(processedData).length > 0) {
      logMessage += '\n' + safeStringify(processedData, config.maxOutputLength);
    }
    
    // Output to console
    switch (level) {
      case LogLevel.ERROR:
        console.error(logMessage);
        break;
      case LogLevel.WARN:
        console.warn(logMessage);
        break;
      case LogLevel.INFO:
        console.info(logMessage);
        break;
      default:
        console.log(logMessage);
    }
  }
  
  return {
    error: (message, data) => log(LogLevel.ERROR, message, data),
    warn: (message, data) => log(LogLevel.WARN, message, data),
    info: (message, data) => log(LogLevel.INFO, message, data),
    debug: (message, data) => log(LogLevel.DEBUG, message, data),
    trace: (message, data) => log(LogLevel.TRACE, message, data),
    
    // Allow changing configuration at runtime
    setLevel: (level) => {
      if (Object.values(LogLevel).includes(level)) {
        config.level = level;
      } else {
        log(LogLevel.WARN, `Invalid log level: ${level}. Using ${config.level}`);
      }
    },
    
    // Get the current logger configuration
    getConfig: () => ({ ...config })
  };
}

// Create and export default logger
export const logger = createLogger(); 