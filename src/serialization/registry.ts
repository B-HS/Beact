import type { ServerComponentRegistry, ClientComponentRegistry, ComponentMetadata } from './types'

/**
 * Create a server-side component registry
 *
 * This registry maps component functions to unique IDs
 * Used during serialization to convert components to references
 */
export function createServerRegistry(): ServerComponentRegistry {
    return new Map<Function, string>()
}

/**
 * Register a component in the server registry
 *
 * @param registry - Server component registry
 * @param component - Component function to register
 * @param id - Optional custom ID (auto-generated if not provided)
 * @returns The component ID
 */
export function registerComponent(
    registry: ServerComponentRegistry,
    component: Function,
    id?: string
): string {
    // Check if already registered
    if (registry.has(component)) {
        return registry.get(component)!
    }

    // Generate ID if not provided
    const componentId = id || generateComponentId(component)

    // Register
    registry.set(component, componentId)

    return componentId
}

/**
 * Register multiple components at once
 *
 * @param registry - Server component registry
 * @param components - Object mapping component names to functions
 * @returns Map of component names to IDs
 */
export function registerComponents(
    registry: ServerComponentRegistry,
    components: Record<string, Function>
): Map<string, string> {
    const idMap = new Map<string, string>()

    for (const [name, component] of Object.entries(components)) {
        const id = registerComponent(registry, component, `c:${name}`)
        idMap.set(name, id)
    }

    return idMap
}

/**
 * Generate a unique component ID
 *
 * Format: "c:ComponentName" or "c:anonymous_<hash>"
 */
function generateComponentId(component: Function): string {
    // Try to get component name
    const name = (component as any).displayName || component.name

    if (name && name !== 'anonymous') {
        return `c:${name}`
    }

    // Generate hash for anonymous components
    const hash = simpleHash(component.toString())
    return `c:anonymous_${hash}`
}

/**
 * Simple hash function for generating IDs
 */
function simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
}

/**
 * Create a client-side component registry
 *
 * This should be generated at build time with all client components
 * Format: { "c:Button": lazy(() => import('./Button')) }
 */
export function createClientRegistry(components: Record<string, any>): ClientComponentRegistry {
    return components
}

/**
 * Get a component from the client registry
 *
 * @param registry - Client component registry
 * @param id - Component ID
 * @returns Component or null if not found
 */
export function getClientComponent(registry: ClientComponentRegistry, id: string): any {
    return registry[id] || null
}

/**
 * Validate component metadata
 */
export function validateComponentMetadata(metadata: ComponentMetadata): boolean {
    if (!metadata.id || typeof metadata.id !== 'string') {
        console.error('Invalid component metadata: missing or invalid id')
        return false
    }

    if (!metadata.name || typeof metadata.name !== 'string') {
        console.error('Invalid component metadata: missing or invalid name')
        return false
    }

    if (!metadata.path || typeof metadata.path !== 'string') {
        console.error('Invalid component metadata: missing or invalid path')
        return false
    }

    return true
}

/**
 * Merge multiple component metadata arrays
 * Useful for combining layouts, pages, and components
 */
export function mergeComponentMetadata(metadataArrays: ComponentMetadata[][]): ComponentMetadata[] {
    const merged = new Map<string, ComponentMetadata>()

    for (const metadataArray of metadataArrays) {
        for (const metadata of metadataArray) {
            if (validateComponentMetadata(metadata)) {
                // Use ID as key to prevent duplicates
                if (!merged.has(metadata.id)) {
                    merged.set(metadata.id, metadata)
                }
            }
        }
    }

    return Array.from(merged.values())
}

/**
 * Filter component metadata by criteria
 */
export function filterComponentMetadata(
    metadata: ComponentMetadata[],
    filter: (meta: ComponentMetadata) => boolean
): ComponentMetadata[] {
    return metadata.filter(filter)
}

/**
 * Get only client components from metadata
 */
export function getClientComponents(metadata: ComponentMetadata[]): ComponentMetadata[] {
    return filterComponentMetadata(metadata, (meta) => meta.isClientComponent === true)
}

/**
 * Get only server components from metadata
 */
export function getServerComponents(metadata: ComponentMetadata[]): ComponentMetadata[] {
    return filterComponentMetadata(metadata, (meta) => meta.isClientComponent !== true)
}

/**
 * Sort component metadata by dependency order
 * Components with no dependencies come first
 */
export function sortByDependencies(metadata: ComponentMetadata[]): ComponentMetadata[] {
    const sorted: ComponentMetadata[] = []
    const remaining = new Set(metadata)
    const processed = new Set<string>()

    // Helper to check if all dependencies are processed
    const canProcess = (meta: ComponentMetadata): boolean => {
        if (!meta.dependencies || meta.dependencies.length === 0) {
            return true
        }
        return meta.dependencies.every((dep) => processed.has(dep))
    }

    // Process until all are sorted
    while (remaining.size > 0) {
        const toProcess: ComponentMetadata[] = []

        // Find components that can be processed
        for (const meta of remaining) {
            if (canProcess(meta)) {
                toProcess.push(meta)
            }
        }

        // If nothing can be processed, we have a circular dependency
        if (toProcess.length === 0) {
            console.warn('Circular dependency detected, processing remaining in arbitrary order')
            toProcess.push(...Array.from(remaining))
        }

        // Process this batch
        for (const meta of toProcess) {
            sorted.push(meta)
            processed.add(meta.id)
            remaining.delete(meta)
        }
    }

    return sorted
}

/**
 * Registry cache for performance
 * Stores pre-built registries to avoid rebuilding on every request
 */
class RegistryCache {
    private serverCache = new Map<string, ServerComponentRegistry>()
    private clientCache = new Map<string, ClientComponentRegistry>()

    setServerRegistry(key: string, registry: ServerComponentRegistry): void {
        this.serverCache.set(key, registry)
    }

    getServerRegistry(key: string): ServerComponentRegistry | null {
        return this.serverCache.get(key) || null
    }

    setClientRegistry(key: string, registry: ClientComponentRegistry): void {
        this.clientCache.set(key, registry)
    }

    getClientRegistry(key: string): ClientComponentRegistry | null {
        return this.clientCache.get(key) || null
    }

    clear(): void {
        this.serverCache.clear()
        this.clientCache.clear()
    }

    clearServer(): void {
        this.serverCache.clear()
    }

    clearClient(): void {
        this.clientCache.clear()
    }
}

/**
 * Global registry cache instance
 */
export const registryCache = new RegistryCache()
