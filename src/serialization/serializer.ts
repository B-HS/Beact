import type { ReactElement } from 'react'
import type {
    SerializedElement,
    SerializedTree,
    SerializationOptions,
    ServerComponentRegistry,
    ComponentRef,
} from './types'
import { SerializationError } from './types'

/**
 * Serialize a React component tree to JSON-compatible format
 *
 * This function transforms a React element tree into a structure that can be:
 * 1. JSON-stringified
 * 2. Sent to the client
 * 3. Reconstructed into React elements
 *
 * @param element - Root React element to serialize
 * @param options - Serialization options including component registry
 * @returns Serialized tree structure
 */
export async function serializeComponentTree(
    element: ReactElement | ReactElement[],
    options: SerializationOptions
): Promise<SerializedTree> {
    try {
        const serialized = Array.isArray(element)
            ? element.map((el) => serializeElement(el, options))
            : serializeElement(element, options)

        const tree: SerializedTree = {
            root: serialized,
        }

        if (options.includeMetadata) {
            tree.metadata = {
                version: '0.1.0', // Bunact version
                timestamp: Date.now(),
            }
        }

        return tree
    } catch (error) {
        throw new SerializationError(
            `Failed to serialize component tree: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
        )
    }
}

/**
 * Serialize a single React element
 */
function serializeElement(element: any, options: SerializationOptions): SerializedElement | any {
    // Handle null/undefined
    if (element == null) {
        return null
    }

    // Handle primitive values (text nodes)
    if (typeof element === 'string' || typeof element === 'number' || typeof element === 'boolean') {
        return element
    }

    // Handle arrays
    if (Array.isArray(element)) {
        return element.map((child) => serializeElement(child, options))
    }

    // Handle React elements
    if (isReactElement(element)) {
        const { type, props, key } = element

        // Serialize the type
        const serializedType = serializeType(type, options.registry)

        // Serialize props (including children)
        const serializedProps = serializeProps(props as Record<string, any>, options)

        const serialized: SerializedElement = {
            $$typeof: '$RE', // Represents Symbol.for('react.element')
            type: serializedType,
            props: serializedProps,
        }

        if (key != null) {
            serialized.key = String(key)
        }

        return serialized
    }

    // Fallback for unknown types
    return null
}

/**
 * Serialize element type (HTML tag or component reference)
 */
function serializeType(type: any, registry: ServerComponentRegistry): string | ComponentRef {
    // HTML tag (string)
    if (typeof type === 'string') {
        return type
    }

    // Function component - look up in registry
    if (typeof type === 'function') {
        const componentId = registry.get(type)

        if (componentId) {
            return {
                $$ref: componentId,
            } as ComponentRef
        }

        // Component not in registry - might be server-only
        // Return a placeholder
        console.warn(`Component not found in registry:`, type.name || type)
        return {
            $$ref: `unknown:${type.name || 'anonymous'}`,
        } as ComponentRef
    }

    // Symbol (Fragment, etc.)
    if (typeof type === 'symbol') {
        const symbolKey = type.toString()
        if (symbolKey.includes('react.fragment')) {
            return 'react.fragment'
        }
        if (symbolKey.includes('react.suspense')) {
            return 'react.suspense'
        }
        // Add more as needed
        return `symbol:${symbolKey}`
    }

    // Object (lazy, memo, etc.)
    if (typeof type === 'object' && type !== null) {
        // Handle React.lazy
        if ('$$typeof' in type && typeof type.$$typeof === 'symbol') {
            const typeofStr = type.$$typeof.toString()
            if (typeofStr.includes('react.lazy')) {
                // Extract the component if possible
                // This is tricky - may need special handling
                return {
                    $$ref: 'lazy:component',
                } as ComponentRef
            }
            if (typeofStr.includes('react.memo')) {
                // Handle memoized components
                return serializeType(type.type, registry)
            }
        }
    }

    // Unknown type - create ComponentRef with fallback
    console.warn(`Unknown component type, creating fallback:`, type)
    return {
        $$ref: `unknown:${typeof type === 'object' ? JSON.stringify(type).slice(0, 50) : String(type)}`,
    } as ComponentRef
}

/**
 * Serialize element props
 */
function serializeProps(props: Record<string, any>, options: SerializationOptions): Record<string, any> {
    const serialized: Record<string, any> = {}

    for (const [key, value] of Object.entries(props)) {
        serialized[key] = serializeValue(value, options)
    }

    return serialized
}

/**
 * Serialize a single value (recursive)
 */
function serializeValue(value: any, options: SerializationOptions): any {
    // Null/undefined
    if (value == null) {
        return value
    }

    // Primitives
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value
    }

    // Functions - strip them (event handlers, etc.)
    // These will be reattached on the client
    if (typeof value === 'function') {
        // Check if it's a registered component
        const componentId = options.registry.get(value)
        if (componentId) {
            return {
                $$ref: componentId,
            } as ComponentRef
        }

        // Otherwise, it's likely an event handler - strip it
        // Client components will reattach their own handlers
        return undefined
    }

    // Arrays
    if (Array.isArray(value)) {
        return value.map((item) => serializeValue(item, options))
    }

    // React elements
    if (isReactElement(value)) {
        return serializeElement(value, options)
    }

    // Plain objects
    if (isPlainObject(value)) {
        const serialized: Record<string, any> = {}
        for (const [k, v] of Object.entries(value)) {
            const serializedValue = serializeValue(v, options)
            if (serializedValue !== undefined) {
                serialized[k] = serializedValue
            }
        }
        return serialized
    }

    // Symbols - convert to string
    if (typeof value === 'symbol') {
        return `symbol:${value.toString()}`
    }

    // Date objects
    if (value instanceof Date) {
        return {
            $$type: 'Date',
            value: value.toISOString(),
        }
    }

    // RegExp
    if (value instanceof RegExp) {
        return {
            $$type: 'RegExp',
            source: value.source,
            flags: value.flags,
        }
    }

    // BigInt
    if (typeof value === 'bigint') {
        return {
            $$type: 'BigInt',
            value: value.toString(),
        }
    }

    // For other types, try to stringify or return null
    try {
        JSON.stringify(value)
        return value
    } catch {
        console.warn('Cannot serialize value:', value)
        return null
    }
}

/**
 * Check if value is a React element
 */
function isReactElement(value: any): value is ReactElement {
    return (
        typeof value === 'object' &&
        value !== null &&
        '$$typeof' in value &&
        (value.$$typeof === Symbol.for('react.element') || value.$$typeof === Symbol.for('react.transitional.element'))
    )
}

/**
 * Check if value is a plain object
 */
function isPlainObject(value: any): boolean {
    if (typeof value !== 'object' || value === null) {
        return false
    }

    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
}

/**
 * Serialize page props separately
 * This ensures props are JSON-safe
 */
export function serializePageProps(props: Record<string, any>): Record<string, any> {
    const serialized: Record<string, any> = {}

    for (const [key, value] of Object.entries(props)) {
        // Skip functions, symbols, etc.
        if (typeof value === 'function' || typeof value === 'symbol') {
            continue
        }

        try {
            // Test if value is JSON-serializable
            JSON.stringify(value)
            serialized[key] = value
        } catch {
            console.warn(`Cannot serialize prop "${key}":`, value)
        }
    }

    return serialized
}
