#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { parse, stringify } from 'yaml';
import { migrateDefinition, validateApiVersion, API_VERSIONS, LATEST_STABLE_VERSION } from '../utils/version.js';
import { logger } from '../utils/logger.js';

/**
 * Print command usage instructions
 */
function printUsage() {
    console.log(`
Agent Definition Version Migration Utility

Usage:
  node migrate-version.js <input-file> [options]

Options:
  --output <file>    Output file (default: adds '-migrated' to input filename)
  --version <ver>    Target API version (default: ${LATEST_STABLE_VERSION})
  --check            Only check if migration is needed, don't perform it
  --quiet            Suppress informational output
  --help             Show this help message

Examples:
  node migrate-version.js ./agents.yaml
  node migrate-version.js ./agents.yaml --version agentnet.io/v1alpha1
  node migrate-version.js ./agents.yaml --output ./agents-new.yaml
  node migrate-version.js ./agents.yaml --check
`);
}

/**
 * Parse command line arguments
 * @returns {Object} Parsed arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const result = {
        inputFile: null,
        outputFile: null,
        targetVersion: LATEST_STABLE_VERSION,
        checkOnly: false,
        quiet: false,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        if (arg === '--help' || arg === '-h') {
            result.help = true;
        } else if (arg === '--output' || arg === '-o') {
            result.outputFile = args[++i];
        } else if (arg === '--version' || arg === '-v') {
            result.targetVersion = args[++i];
        } else if (arg === '--check' || arg === '-c') {
            result.checkOnly = true;
        } else if (arg === '--quiet' || arg === '-q') {
            result.quiet = true;
        } else if (!result.inputFile) {
            result.inputFile = arg;
        }
    }

    return result;
}

/**
 * Get default output filename based on input filename
 * @param {string} inputFile - Input file path
 * @param {string} targetVersion - Target API version
 * @returns {string} Default output file path
 */
function getDefaultOutputFile(inputFile, targetVersion) {
    const parsedPath = path.parse(inputFile);
    const versionSuffix = targetVersion.replace(/\//g, '-');
    return path.join(
        parsedPath.dir,
        `${parsedPath.name}-${versionSuffix}${parsedPath.ext}`
    );
}

/**
 * Log a message if not in quiet mode
 * @param {string} message - Message to log
 * @param {boolean} isError - Whether this is an error message
 * @param {boolean} quiet - Whether quiet mode is enabled
 */
function log(message, isError = false, quiet = false) {
    if (isError || !quiet) {
        console.log(message);
    }
}

/**
 * Process and migrate a YAML file containing agent definitions
 * @param {string} content - YAML content
 * @param {string} targetVersion - Target API version
 * @param {boolean} checkOnly - Only check, don't modify
 * @returns {Object} Migration results including modified content
 */
function processYamlFile(content, targetVersion, checkOnly) {
    // Split the YAML content by document separator
    const documents = content.split(/^---$/m)
        .map(s => s.trim())
        .filter(s => s);
    
    const result = {
        migrated: false,
        migratedCount: 0,
        alreadyUpToDateCount: 0,
        failedCount: 0,
        needsMigration: false,
        updatedContent: null,
        failures: []
    };
    
    // Process each document
    const processedDocs = [];
    
    for (let i = 0; i < documents.length; i++) {
        try {
            const docContent = documents[i];
            const doc = parse(docContent);
            
            // Skip non-agent definitions
            if (!doc || doc.kind !== 'AgentDefinition') {
                processedDocs.push(docContent);
                continue;
            }
            
            // Check if migration is needed
            const currentVersion = doc.apiVersion || 'smartagent.io/v1alpha1';
            const agentName = doc.metadata?.name || `[Document ${i+1}]`;
            
            if (currentVersion === targetVersion) {
                result.alreadyUpToDateCount++;
                log(`Agent "${agentName}" is already at version ${targetVersion}`);
                processedDocs.push(docContent);
                continue;
            }
            
            result.needsMigration = true;
            
            // If only checking, skip migration
            if (checkOnly) {
                processedDocs.push(docContent);
                continue;
            }
            
            // Perform migration
            const migratedDoc = migrateDefinition(doc, targetVersion);
            result.migratedCount++;
            result.migrated = true;
            
            // Convert back to YAML and add to processed docs
            processedDocs.push(stringify(migratedDoc));
            
            log(`Successfully migrated agent "${agentName}" from ${currentVersion} to ${targetVersion}`);
            
        } catch (error) {
            result.failedCount++;
            result.failures.push({
                documentIndex: i,
                error: error.message
            });
            
            // Keep original document on failure
            processedDocs.push(documents[i]);
            
            log(`Error processing document ${i+1}: ${error.message}`, true);
        }
    }
    
    // Combine the processed documents back into a single YAML file
    result.updatedContent = processedDocs.join('\n---\n');
    
    return result;
}

/**
 * Main function
 */
async function main() {
    const args = parseArgs();
    
    // Show help if requested or no input file
    if (args.help || !args.inputFile) {
        printUsage();
        process.exit(args.help ? 0 : 1);
    }
    
    // Validate target version
    if (!API_VERSIONS[args.targetVersion]) {
        log(`Error: Unsupported target version: ${args.targetVersion}`, true);
        log(`Supported versions: ${Object.keys(API_VERSIONS).join(', ')}`, true);
        process.exit(1);
    }
    
    try {
        // Set default output file if not specified
        if (!args.outputFile && !args.checkOnly) {
            args.outputFile = getDefaultOutputFile(args.inputFile, args.targetVersion);
        }
        
        // Read input file
        const content = fs.readFileSync(args.inputFile, 'utf8');
        
        // Process the file
        const result = processYamlFile(content, args.targetVersion, args.checkOnly);
        
        // Output results
        if (result.needsMigration) {
            if (args.checkOnly) {
                log(`Migration needed: ${result.alreadyUpToDateCount} up-to-date, ${result.failedCount + documents.length - result.alreadyUpToDateCount} need migration`);
                process.exit(10); // Special exit code indicating migration needed
            } else if (result.migrated) {
                // Write the output file
                fs.writeFileSync(args.outputFile, result.updatedContent);
                
                log(`
Migration completed:
  - ${result.migratedCount} agent definitions migrated
  - ${result.alreadyUpToDateCount} already up-to-date
  - ${result.failedCount} failures
  - Output written to: ${args.outputFile}
                `);
            }
        } else {
            log(`No migration needed. All agent definitions are already at version ${args.targetVersion}`);
        }
        
        // Exit with error if any migrations failed
        if (result.failedCount > 0) {
            process.exit(1);
        }
        
    } catch (error) {
        log(`Error: ${error.message}`, true);
        process.exit(1);
    }
}

// Run the main function
main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
}); 