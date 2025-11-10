/**
 * Bunact Component Tree Serialization Module
 *
 * This module provides serialization and deserialization of React component trees
 * to eliminate server-only imports from client bundles.
 *
 * @module serialization
 */

// Export types
export type {
    SerializedElement,
    SerializedTree,
    ComponentRef,
    ServerComponentRegistry,
    ClientComponentRegistry,
    SerializationOptions,
    DeserializationOptions,
    ComponentMetadata,
    RegistryBuildResult,
} from './types'

export { SerializationError, DeserializationError } from './types'

// Export serialization functions
export { serializeComponentTree, serializePageProps } from './serializer'

// Export deserialization functions
export { deserializeComponentTree, deserializePageProps } from './deserializer'

// Export registry management
export {
    createServerRegistry,
    createClientRegistry,
    registerComponent,
    registerComponents,
    getClientComponent,
    validateComponentMetadata,
    mergeComponentMetadata,
    filterComponentMetadata,
    getClientComponents,
    getServerComponents,
    sortByDependencies,
    registryCache,
} from './registry'
