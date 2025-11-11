import type { ReactNode, ReactElement } from 'react'
import type { Metadata } from './metadata/types'
import type { RouteParams } from './router/types'

export interface PageProps {
    params?: RouteParams
    searchParams?: Record<string, string | string[]>
    cookies?: Record<string, string>
    headers?: Headers
}

export interface SerializablePageProps {
    params?: RouteParams
    searchParams?: Record<string, string | string[]>
    cookies?: Record<string, string>
    headers?: Record<string, string>
    metadata?: Metadata[]
}

export interface ComponentFactoryResult {
    metadata?: Metadata[]
    default: (props?: { children?: ReactNode; metadata?: Metadata[] }) => ReactElement | Promise<ReactElement>
}

export interface ComponentFactory {
    default: (props?: { children?: ReactNode; metadata?: Metadata[] } & PageProps) => ComponentFactoryResult | Promise<ComponentFactoryResult>
    __ssr?: ComponentFactoryResult
    revalidate?: number | false
}

export type ProxyHandler = (request: Request) => Request | Response | Promise<Request | Response>

export interface BundleContext {
    rootDir: string
    pagesDir: string
    cacheDir: string
    bundleId: string
    pathname: string
}

export type CSSHandler = {
    filter: RegExp
    handler: (args: import('bun').OnLoadArgs) => Promise<import('bun').OnLoadResult | void>
}

export type LoadHandler = {
    type: 'load'
    opts: { filter: RegExp; namespace?: string }
    handler: (args: import('bun').OnLoadArgs) => Promise<import('bun').OnLoadResult | void>
}

export type ResolveHandler = {
    type: 'resolve'
    opts: { filter: RegExp; namespace?: string }
    handler: (args: import('bun').OnResolveArgs) => Promise<import('bun').OnResolveResult | null | undefined> | import('bun').OnResolveResult | null | undefined
}

export interface BunactPlugin {
    name: string
    setup?: (config: BunactConfig) => void | Promise<void>
    bundlePlugin?: import('bun').BunPlugin | ((context: BundleContext) => import('bun').BunPlugin)
}

export interface BunactConfig {
    rootDir?: string
    pagesDir?: string
    publicDir?: string
    cacheDir?: string
    port?: number
    constants?: Partial<import('./config/constants').BunactConstants>
    plugins?: BunactPlugin[]
}

export interface ResolvedBunactConfig {
    rootDir: string
    pagesDir: string
    publicDir: string
    cacheDir: string
    port: number
    constants: import('./config/constants').BunactConstants
    plugins?: BunactPlugin[]
    publicEnvVars?: Record<string, string>
}

declare global {
    interface Window {
        __BUNACT_PROMISE_CACHE__?: Record<string, any>
        __BUNACT_PAGE_PROPS__?: SerializablePageProps
    }
}

export type { Metadata } from './metadata/types'
export type { RouteInfo, RouteMap, RouteParams, ApiHandler, ApiRouteModule, HttpMethod, ApiRouteInfo, ApiRouteMap } from './router/types'
export type { ImageProps, ImageFormat, ImageOptimizationOptions, ImageCacheEntry } from './image/types'
