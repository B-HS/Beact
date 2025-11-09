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
}

export interface ComponentFactoryResult {
    metadata?: Metadata[]
    default: () => ReactElement | Promise<ReactElement>
}

export interface ComponentFactory {
    default: (props?: { children?: ReactNode; metadata?: Metadata[] } & PageProps) => ComponentFactoryResult | Promise<ComponentFactoryResult>
    __ssr?: ComponentFactoryResult
    revalidate?: number | false
}

export type ProxyHandler = (request: Request) => Request | Response | Promise<Request | Response>

export interface MeactPlugin {
    name: string
    setup?: (config: MeactConfig) => void | Promise<void>
    bundlePlugin?: any
}

export interface MeactConfig {
    rootDir?: string
    pagesDir?: string
    publicDir?: string
    cacheDir?: string
    port?: number
    constants?: Partial<import('./config/constants').MeactConstants>
    plugins?: MeactPlugin[]
}

export interface ResolvedMeactConfig {
    rootDir: string
    pagesDir: string
    publicDir: string
    cacheDir: string
    port: number
    constants: import('./config/constants').MeactConstants
    plugins?: MeactPlugin[]
}

declare global {
    interface Window {
        __MEACT_PROMISE_CACHE__?: Record<string, any>
        __MEACT_PAGE_PROPS__?: SerializablePageProps
    }
}

export type { Metadata } from './metadata/types'
export type { RouteInfo, RouteMap, RouteParams, ApiHandler, ApiRouteModule, HttpMethod, ApiRouteInfo, ApiRouteMap } from './router/types'
export type { ImageProps, ImageFormat, ImageOptimizationOptions, ImageCacheEntry } from './image/types'
