import { logger } from './logger.js';
import { ConfigurationError } from '../errors/index.js';

/**
 * Map of API versions with their compatibility information
 */
export const API_VERSIONS = {
    'agentnet/v1alpha1': {
        isSupported: true,
        isStable: true,
        minEngineVersion: '0.0.4',
        features: ['basic', 'discovery', 'handoffs', 'advanced-routing']
    }
};

/**
 * Default API version to use when none is specified
 */
export const DEFAULT_API_VERSION = 'agentnet/v1alpha1';

/**
 * Latest stable API version
 */
export const LATEST_STABLE_VERSION = 'agentnet/v1alpha1';

/**
 * Version upgrade paths map
 * Defines valid upgrade paths between versions
 */
export const VERSION_UPGRADE_PATHS = {
    'agentnet/v1alpha1': ['agentnet/v1alpha1']
};

/**
 * Check if an API version is supported
 * @param {string} version - The API version to check
 * @returns {boolean} True if the version is supported
 */
export function isVersionSupported(version) {
    return API_VERSIONS[version]?.isSupported === true;
}

/**
 * Check if an API version is stable (not subject to breaking changes)
 * @param {string} version - The API version to check
 * @returns {boolean} True if the version is stable
 */
export function isVersionStable(version) {
    return API_VERSIONS[version]?.isStable === true;
}

/**
 * Checks if a feature is supported in given API version
 * @param {string} version - The API version to check
 * @param {string} feature - The feature to check
 * @returns {boolean} True if the feature is supported in this version
 */
export function isFeatureSupported(version, feature) {
    return API_VERSIONS[version]?.features?.includes(feature) === true;
}

/**
 * Validates an agent definition's API version
 * @param {object} definition - Agent definition with apiVersion
 * @param {string} currentEngineVersion - Current version of the agent engine
 * @returns {object} Validated version information
 * @throws {ConfigurationError} If version is unsupported
 */
export function validateApiVersion(definition, currentEngineVersion = '1.0.0') {
    const apiVersion = definition.apiVersion || DEFAULT_API_VERSION;
    const agentName = definition.metadata?.name || 'Unnamed Agent';
    
    // Check if version exists
    const versionInfo = API_VERSIONS[apiVersion];
    if (!versionInfo) {
        const supportedVersions = Object.keys(API_VERSIONS).join(', ');
        throw new ConfigurationError(
            `Unsupported apiVersion '${apiVersion}' for agent '${agentName}'. Supported versions: ${supportedVersions}`,
            { apiVersion, agentName }
        );
    }
    
    // Check if version is supported
    if (!versionInfo.isSupported) {
        throw new ConfigurationError(
            `API version '${apiVersion}' is deprecated for agent '${agentName}'. Please update to a supported version.`,
            { apiVersion, agentName }
        );
    }
    
    // Check engine compatibility (simple version check for now)
    if (versionInfo.minEngineVersion && versionInfo.minEngineVersion > currentEngineVersion) {
        logger.warn(
            `Agent '${agentName}' uses apiVersion '${apiVersion}' which requires engine version ${versionInfo.minEngineVersion} or higher. Current: ${currentEngineVersion}`,
            { apiVersion, agentName, minEngineVersion: versionInfo.minEngineVersion, currentEngineVersion }
        );
    }
    
    // Log stability warning for non-stable versions
    if (!versionInfo.isStable) {
        logger.warn(
            `Agent '${agentName}' uses apiVersion '${apiVersion}' which is not marked as stable and may have breaking changes in future releases.`,
            { apiVersion, agentName }
        );
    }
    
    return {
        version: apiVersion,
        info: versionInfo
    };
}

/**
 * Get normalized version of API version
 * This extracts just the version part, removing the domain prefix
 * @param {string} apiVersion - Full API version string (e.g., 'agentnet.io/v1alpha1')
 * @returns {string} Normalized version (e.g., 'v1alpha1')
 */
export function getNormalizedVersion(apiVersion) {
    const parts = apiVersion.split('/');
    return parts.length > 1 ? parts[1] : apiVersion;
}

/**
 * Checks if an upgrade path exists between versions
 * @param {string} fromVersion - Source version
 * @param {string} toVersion - Target version
 * @returns {boolean} Whether a direct upgrade path exists
 */
export function canUpgradeVersion(fromVersion, toVersion) {
    if (fromVersion === toVersion) return true;
    return VERSION_UPGRADE_PATHS[fromVersion]?.includes(toVersion) === true;
}

/**
 * Get possible upgrade paths for a version
 * @param {string} fromVersion - Current version
 * @returns {string[]} Available upgrade targets
 */
export function getUpgradeOptions(fromVersion) {
    return VERSION_UPGRADE_PATHS[fromVersion] || [];
}

/**
 * Migration helpers for each version transformation
 */
const VERSION_MIGRATIONS = {
    // Migration from smartagent.io/v1alpha1 to agentnet.io/v1alpha1
        'smartagent.io/v1alpha1->agentnet.io/v1alpha1': (definition) => {
        // Deep clone the definition to avoid modifying the original
        const newDef = JSON.parse(JSON.stringify(definition));
        
        // Update the apiVersion
        newDef.apiVersion = 'agentnet/v1alpha1';
        
        // Handle specific field migrations
        // Example: rename or restructure fields as needed
        
        // Log the migration
        logger.info(`Migrated agent definition from smartagent.io/v1alpha1 to agentnet/v1alpha1`, { 
            agentName: newDef.metadata?.name 
        });
        
        return newDef;
    }
};

/**
 * Migrate an agent definition from one version to another
 * @param {object} definition - Agent definition to migrate
 * @param {string} targetVersion - Target API version
 * @returns {object} Migrated definition
 * @throws {ConfigurationError} If migration path doesn't exist
 */
export function migrateDefinition(definition, targetVersion) {
    const sourceVersion = definition.apiVersion || DEFAULT_API_VERSION;
    
    // If already at target version, return as is
    if (sourceVersion === targetVersion) {
        return definition;
    }
    
    // Check if direct upgrade path exists
    if (!canUpgradeVersion(sourceVersion, targetVersion)) {
        throw new ConfigurationError(
            `No direct migration path from ${sourceVersion} to ${targetVersion}`,
            { sourceVersion, targetVersion }
        );
    }
    
    // Get the migration function
    const migrationKey = `${sourceVersion}->${targetVersion}`;
    const migrationFn = VERSION_MIGRATIONS[migrationKey];
    
    if (!migrationFn) {
        throw new ConfigurationError(
            `Migration path exists but no implementation found for ${migrationKey}`,
            { sourceVersion, targetVersion }
        );
    }
    
    // Apply the migration
    return migrationFn(definition);
} 