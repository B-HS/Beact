import { createElement, Fragment, Suspense, type ReactElement } from 'react'
import type {
    SerializedElement,
    SerializedTree,
    DeserializationOptions,
    ClientComponentRegistry,
    ComponentRef,
} from './types'
import { DeserializationError } from './types'

/**
 * Deserialize a JSON-compatible structure back to React elements
 *
 * This function reconstructs a React element tree from serialized data:
 * 1. Parse serialized structure
 * 2. Look up components in client registry
 * 3. Reconstruct React elements
 * 4. Restore special types (Date, RegExp, etc.)
 *
 * @param serialized - Serialized tree structure
 * @param options - Deserialization options including component registry
 * @returns React element tree ready for hydration
 */
export async function deserializeComponentTree(
    serialized: SerializedTree,
    options: DeserializationOptions
): Promise<ReactElement | ReactElement[]> {
    try {
        const { root } = serialized

        if (Array.isArray(root)) {
            return root.map((el) => deserializeElement(el, options))
        }

        return deserializeElement(root, options)
    } catch (error) {
        throw new DeserializationError(
            `Failed to deserialize component tree: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
        )
    }
}

/**
 * Deserialize a single element
 */
function deserializeElement(element: any, options: DeserializationOptions): any {
    // Handle null/undefined
    if (element == null) {
        return null
    }

    // Handle primitives (text nodes)
    if (typeof element === 'string' || typeof element === 'number' || typeof element === 'boolean') {
        return element
    }

    // Handle arrays
    if (Array.isArray(element)) {
        return element.map((child) => deserializeElement(child, options))
    }

    // Handle serialized elements
    if (isSerializedElement(element)) {
        const { type, props, key } = element

        // Deserialize the type
        const deserializedType = deserializeType(type, options.registry)

        // Deserialize props (including children)
        const deserializedProps = deserializeProps(props, options)

        // Create React element
        const reactElement = createElement(
            deserializedType,
            key != null ? { ...deserializedProps, key } : deserializedProps
        )

        return reactElement
    }

    // Handle special serialized types
    if (isSpecialType(element)) {
        return deserializeSpecialType(element)
    }

    // Fallback
    return element
}

/**
 * Deserialize element type
 */
function deserializeType(type: string | ComponentRef, registry: ClientComponentRegistry): any {
    // ComponentRef - look up in registry
    if (typeof type === 'object' && type !== null && '$$ref' in type) {
        const componentId = type.$$ref

        // Handle special React types
        if (componentId.startsWith('symbol:')) {
            return deserializeSymbolType(componentId)
        }

        // Look up in registry
        const Component = registry[componentId]

        if (!Component) {
            console.error(`Component not found in client registry: ${componentId}`)
            // Return 'div' tag as fallback (not a function!)
            // This prevents "[object Object]" error
            console.warn(`Using <div> placeholder for missing component: ${componentId}`)
            return 'div'
        }

        return Component
    }

    // String type
    if (typeof type === 'string') {
        // Handle special React types
        if (type === 'react.fragment') {
            return Fragment
        }
        if (type === 'react.suspense') {
            return Suspense
        }
        if (type.startsWith('symbol:')) {
            return deserializeSymbolType(type)
        }

        // HTML tag
        return type
    }

    // Fallback for unknown types
    console.error(`Unknown type received in deserializeType:`, type)
    return 'div'
}

/**
 * Deserialize React symbol types
 */
function deserializeSymbolType(symbolStr: string): any {
    if (symbolStr.includes('fragment')) {
        return Fragment
    }
    if (symbolStr.includes('suspense')) {
        return Suspense
    }

    // Unknown symbol - return fragment as fallback
    console.warn(`Unknown symbol type: ${symbolStr}`)
    return Fragment
}

/**
 * Deserialize props object
 */
function deserializeProps(props: Record<string, any>, options: DeserializationOptions): Record<string, any> {
    const deserialized: Record<string, any> = {}

    for (const [key, value] of Object.entries(props)) {
        deserialized[key] = deserializeValue(value, options)
    }

    return deserialized
}

/**
 * Deserialize a single value (recursive)
 */
function deserializeValue(value: any, options: DeserializationOptions): any {
    // Null/undefined
    if (value == null) {
        return value
    }

    // Primitives
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value
    }

    // Arrays
    if (Array.isArray(value)) {
        return value.map((item) => deserializeValue(item, options))
    }

    // Component references
    if (typeof value === 'object' && value !== null && '$$ref' in value) {
        return deserializeType(value, options.registry)
    }

    // Serialized elements
    if (isSerializedElement(value)) {
        return deserializeElement(value, options)
    }

    // Special types
    if (isSpecialType(value)) {
        return deserializeSpecialType(value)
    }

    // Plain objects
    if (isPlainObject(value)) {
        const deserialized: Record<string, any> = {}
        for (const [k, v] of Object.entries(value)) {
            deserialized[k] = deserializeValue(v, options)
        }
        return deserialized
    }

    // Fallback
    return value
}

/**
 * Deserialize special types (Date, RegExp, BigInt, etc.)
 */
function deserializeSpecialType(value: any): any {
    const { $$type } = value

    switch ($$type) {
        case 'Date':
            return new Date(value.value)

        case 'RegExp':
            return new RegExp(value.source, value.flags)

        case 'BigInt':
            return BigInt(value.value)

        default:
            console.warn(`Unknown special type: ${$$type}`)
            return value
    }
}

/**
 * Check if value is a serialized element
 */
function isSerializedElement(value: any): value is SerializedElement {
    return typeof value === 'object' && value !== null && value.$$typeof === '$RE' && 'type' in value && 'props' in value
}

/**
 * Check if value is a special type
 */
function isSpecialType(value: any): boolean {
    return typeof value === 'object' && value !== null && '$$type' in value
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
 * Deserialize page props
 * This is a simple pass-through since props should already be JSON-safe
 */
export function deserializePageProps(props: Record<string, any>): Record<string, any> {
    const deserialized: Record<string, any> = {}

    for (const [key, value] of Object.entries(props)) {
        // Handle special types
        if (isSpecialType(value)) {
            deserialized[key] = deserializeSpecialType(value)
        } else {
            deserialized[key] = value
        }
    }

    return deserialized
}
