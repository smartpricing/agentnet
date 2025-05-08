import { ValidationError } from '../errors/index.js';
import { logger } from './logger.js';

/**
 * Validates that a value is not null or undefined
 * @param {any} value - Value to check
 * @param {string} name - Name of the value for error messages
 * @param {string} context - Context for logging
 * @throws {ValidationError} If validation fails
 */
export function validateRequired(value, name, context = '') {
    if (value === undefined || value === null) {
        const errorMsg = `${name} is required`;
        logger.error(errorMsg, { context });
        throw new ValidationError(errorMsg, [{ field: name, message: 'Required field is missing' }]);
    }
}

/**
 * Validates that a value is of a specific type
 * @param {any} value - Value to check
 * @param {string} expectedType - Expected type ('string', 'number', 'boolean', 'object', 'function', 'array')
 * @param {string} name - Name of the value for error messages
 * @param {string} context - Context for logging
 * @throws {ValidationError} If validation fails
 */
export function validateType(value, expectedType, name, context = '') {
    if (value === undefined || value === null) {
        return; // Skip type validation for null/undefined
    }
    
    let valid = false;
    
    if (expectedType === 'array') {
        valid = Array.isArray(value);
    } else if (expectedType === 'object' && Array.isArray(value)) {
        valid = false; // Arrays are not objects for this validation
    } else {
        valid = typeof value === expectedType;
    }
    
    if (!valid) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        const errorMsg = `${name} must be of type ${expectedType}, got ${actualType}`;
        logger.error(errorMsg, { context, value: String(value).substring(0, 100) });
        throw new ValidationError(errorMsg, [{ 
            field: name, 
            message: `Expected ${expectedType}, got ${actualType}`,
            actual: actualType,
            expected: expectedType
        }]);
    }
}

/**
 * Validates that a string matches a regex pattern
 * @param {string} value - String to validate
 * @param {RegExp} pattern - Regex pattern to match
 * @param {string} name - Name of the value for error messages
 * @param {string} context - Context for logging
 * @throws {ValidationError} If validation fails
 */
export function validatePattern(value, pattern, name, context = '') {
    if (value === undefined || value === null) {
        return; // Skip pattern validation for null/undefined
    }
    
    if (typeof value !== 'string') {
        const errorMsg = `${name} must be a string for pattern validation`;
        logger.error(errorMsg, { context });
        throw new ValidationError(errorMsg, [{ 
            field: name, 
            message: 'Must be a string for pattern validation' 
        }]);
    }
    
    if (!pattern.test(value)) {
        const errorMsg = `${name} does not match required pattern`;
        logger.error(errorMsg, { context, pattern: pattern.toString() });
        throw new ValidationError(errorMsg, [{ 
            field: name, 
            message: 'Value does not match required pattern',
            pattern: pattern.toString()
        }]);
    }
}

/**
 * Validates an object against a schema
 * @param {Object} obj - Object to validate
 * @param {Object} schema - Validation schema with field definitions
 * @param {string} context - Context for logging
 * @throws {ValidationError} If validation fails
 */
export function validateObject(obj, schema, context = '') {
    validateType(obj, 'object', 'object', context);
    validateType(schema, 'object', 'schema', context);
    
    const errors = [];
    
    // Check required fields
    if (schema.required && Array.isArray(schema.required)) {
        for (const field of schema.required) {
            if (obj[field] === undefined || obj[field] === null) {
                errors.push({ 
                    field, 
                    message: 'Required field is missing'
                });
            }
        }
    }
    
    // Check field types and constraints
    if (schema.properties && typeof schema.properties === 'object') {
        for (const [field, fieldSchema] of Object.entries(schema.properties)) {
            // Skip if field is not present and not required
            if ((obj[field] === undefined || obj[field] === null) && 
                (!schema.required || !schema.required.includes(field))) {
                continue;
            }
            
            // Validate field if present
            if (obj[field] !== undefined && obj[field] !== null) {
                // Check type
                if (fieldSchema.type) {
                    try {
                        validateType(obj[field], fieldSchema.type, field, context);
                    } catch (error) {
                        if (error instanceof ValidationError) {
                            errors.push(...error.errors);
                        } else {
                            errors.push({ field, message: error.message });
                        }
                    }
                }
                
                // Check pattern for strings
                if (fieldSchema.type === 'string' && fieldSchema.pattern) {
                    try {
                        validatePattern(obj[field], new RegExp(fieldSchema.pattern), field, context);
                    } catch (error) {
                        if (error instanceof ValidationError) {
                            errors.push(...error.errors);
                        } else {
                            errors.push({ field, message: error.message });
                        }
                    }
                }
                
                // Check enum values
                if (fieldSchema.enum && Array.isArray(fieldSchema.enum) && 
                    !fieldSchema.enum.includes(obj[field])) {
                    errors.push({ 
                        field, 
                        message: `Value must be one of: ${fieldSchema.enum.join(', ')}`,
                        enum: fieldSchema.enum,
                        actual: obj[field]
                    });
                }
                
                // Check nested objects recursively
                if (fieldSchema.type === 'object' && fieldSchema.properties && 
                    typeof obj[field] === 'object' && obj[field] !== null) {
                    try {
                        validateObject(obj[field], fieldSchema, `${context}.${field}`);
                    } catch (error) {
                        if (error instanceof ValidationError) {
                            // Add parent field to nested errors
                            const nestedErrors = error.errors.map(err => ({
                                ...err,
                                field: `${field}.${err.field}`
                            }));
                            errors.push(...nestedErrors);
                        } else {
                            errors.push({ field, message: error.message });
                        }
                    }
                }
                
                // Check array items
                if (fieldSchema.type === 'array' && fieldSchema.items && 
                    Array.isArray(obj[field])) {
                    for (let i = 0; i < obj[field].length; i++) {
                        const item = obj[field][i];
                        
                        // Validate item type
                        if (typeof fieldSchema.items === 'string') {
                            try {
                                validateType(item, fieldSchema.items, `${field}[${i}]`, context);
                            } catch (error) {
                                if (error instanceof ValidationError) {
                                    errors.push(...error.errors);
                                } else {
                                    errors.push({ field: `${field}[${i}]`, message: error.message });
                                }
                            }
                        } 
                        // Validate item against schema
                        else if (typeof fieldSchema.items === 'object') {
                            try {
                                validateObject(item, fieldSchema.items, `${context}.${field}[${i}]`);
                            } catch (error) {
                                if (error instanceof ValidationError) {
                                    // Add parent field to nested errors
                                    const nestedErrors = error.errors.map(err => ({
                                        ...err,
                                        field: `${field}[${i}].${err.field}`
                                    }));
                                    errors.push(...nestedErrors);
                                } else {
                                    errors.push({ field: `${field}[${i}]`, message: error.message });
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // If errors were found, throw ValidationError
    if (errors.length > 0) {
        const errorMsg = `Validation failed for ${context || 'object'}: ${errors.map(e => e.message).join(', ')}`;
        logger.error(errorMsg, { errors });
        throw new ValidationError(errorMsg, errors);
    }
    
    return true;
}

/**
 * Validates tool input against its schema
 * @param {Object} toolSchema - Tool schema with parameters definition
 * @param {Object} input - Input data to validate
 * @returns {Object} Validation result with success boolean and optional errors
 */
export function validateToolInput(toolSchema, input) {
    if (!toolSchema || !toolSchema.parameters) {
        return { valid: true };
    }
    
    try {
        validateObject(input, toolSchema.parameters, `tool.${toolSchema.name || 'unknown'}`);
        return { valid: true };
    } catch (error) {
        if (error instanceof ValidationError) {
            return {
                valid: false,
                errors: error.errors
            };
        }
        
        return {
            valid: false,
            errors: [{ message: error.message }]
        };
    }
}

/**
 * Validates that a value is one of the allowed values
 * @param {any} value - Value to check
 * @param {Array} allowedValues - List of allowed values
 * @param {string} name - Name of the value for error messages
 * @param {string} context - Context for logging
 * @throws {ValidationError} If validation fails
 */
export function validateEnum(value, allowedValues, name, context = '') {
    if (value === undefined || value === null) {
        return; // Skip enum validation for null/undefined
    }
    
    if (!Array.isArray(allowedValues)) {
        throw new Error('allowedValues must be an array');
    }
    
    if (!allowedValues.includes(value)) {
        const errorMsg = `${name} must be one of: ${allowedValues.join(', ')}`;
        logger.error(errorMsg, { context, value });
        throw new ValidationError(errorMsg, [{ 
            field: name, 
            message: 'Value is not in allowed values list',
            allowedValues,
            actual: value
        }]);
    }
} 