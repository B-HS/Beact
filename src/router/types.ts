export interface RouteInfo {
    layouts: string[]
    page?: string
    error?: string
    notFound?: string
    loading?: string
    pattern?: string
    isDynamic?: boolean
    params?: string[]
    catchAllParams?: string[]
}

export type RouteMap = Record<string, RouteInfo>

export interface RouteParams {
    [key: string]: string | string[]
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD'

export type ApiHandler = (request: Request, context: { params: RouteParams }) => Response | Promise<Response>

export interface ApiRouteModule {
    GET?: ApiHandler
    POST?: ApiHandler
    PUT?: ApiHandler
    DELETE?: ApiHandler
    PATCH?: ApiHandler
    OPTIONS?: ApiHandler
    HEAD?: ApiHandler
}

export interface ApiRouteInfo {
    filePath: string
    pattern?: string
    isDynamic?: boolean
    params?: string[]
    catchAllParams?: string[]
}

export type ApiRouteMap = Record<string, ApiRouteInfo>
