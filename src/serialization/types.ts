import type { ReactElement, ReactNode } from 'react'

/**
 * Serialized React Element structure
 * Compatible with JSON serialization
 */
export interface SerializedElement {
    /**
     * React element type marker
     * "$RE" represents Symbol.for('react.element')
     */
    $$typeof: '$RE'

    /**
     * Component type: HTML tag string or component reference
     */
    type: string | ComponentRef

    /**
     * Element props (must be JSON-serializable)
     */
    props: Record<string, any>

    /**
     * Optional React key
     */
    key?: string | null
}

/**
 * Component reference in serialized tree
 * Points to a component in the registry
 */
export interface ComponentRef {
    /**
     * Unique component ID in registry
     * Format: "c:ComponentName"
     */
    $$ref: string

    /**
     * Optional module path for code splitting
     */
    module?: string
}

/**
 * Complete serialized component tree
 */
export interface SerializedTree {
    /**
     * Root element of the tree
     */
    root: SerializedElement | SerializedElement[]

    /**
     * Metadata about the serialization
     */
    metadata?: {
        /**
         * Bunact version used for serialization
         */
        version: string

        /**
         * Timestamp of serialization
         */
        timestamp: number

        /**
         * Page path that generated this tree
         */
        pagePath?: string
    }
}

/**
 * Server-side component registry
 * Maps component functions to unique IDs
 */
export type ServerComponentRegistry = Map<Function, string>

/**
 * Client-side component registry
 * Maps component IDs to lazy-loaded components
 */
export type ClientComponentRegistry = Record<string, React.LazyExoticComponent<any> | React.ComponentType<any>>

/**
 * Options for serialization
 */
export interface SerializationOptions {
    /**
     * Component registry for mapping functions to IDs
     */
    registry: ServerComponentRegistry

    /**
     * Page props to serialize
     */
    pageProps?: Record<string, any>

    /**
     * Promise cache for async data
     */
    promiseCache?: Record<string, any>

    /**
     * Whether to include metadata
     */
    includeMetadata?: boolean

    /**
     * Custom replacer function for JSON.stringify
     */
    customReplacer?: (key: string, value: any) => any
}

/**
 * Options for deserialization
 */
export interface DeserializationOptions {
    /**
     * Component registry for mapping IDs to components
     */
    registry: ClientComponentRegistry

    /**
     * Page props to inject
     */
    pageProps?: Record<string, any>

    /**
     * Promise cache for hydration
     */
    promiseCache?: Record<string, any>

    /**
     * Custom reviver function for JSON.parse
     */
    customReviver?: (key: string, value: any) => any
}

/**
 * Serialization error types
 */
export class SerializationError extends Error {
    constructor(message: string, public override cause?: Error) {
        super(message)
        this.name = 'SerializationError'
    }
}

export class DeserializationError extends Error {
    constructor(message: string, public override cause?: Error) {
        super(message)
        this.name = 'DeserializationError'
    }
}

/**
 * Component metadata for registry building
 */
export interface ComponentMetadata {
    /**
     * Component unique ID
     */
    id: string

    /**
     * Component display name
     */
    name: string

    /**
     * File path to component
     */
    path: string

    /**
     * Whether component is marked with 'use client'
     */
    isClientComponent: boolean

    /**
     * Whether component uses default export
     */
    isDefaultExport: boolean

    /**
     * Module dependencies
     */
    dependencies?: string[]
}

/**
 * Registry build result
 */
export interface RegistryBuildResult {
    /**
     * Server-side registry code
     */
    serverRegistry: string

    /**
     * Client-side registry code
     */
    clientRegistry: string

    /**
     * Component metadata list
     */
    components: ComponentMetadata[]
}
