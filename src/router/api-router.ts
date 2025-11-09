import type { ApiRouteMap, ApiRouteModule, HttpMethod, RouteParams } from './types'

const matchApiRoute = (pathname: string, routes: ApiRouteMap): { route: string; params: RouteParams } | null => {
    const apiPath = pathname.replace(/^\/api/, '')

    const staticRoute = routes[apiPath]
    if (staticRoute && !staticRoute.isDynamic) {
        return { route: apiPath, params: {} }
    }

    for (const [route, info] of Object.entries(routes)) {
        if (!info.isDynamic || !info.pattern) continue

        const regex = new RegExp(`^${info.pattern}$`)
        const match = apiPath.match(regex)

        if (match) {
            const params: RouteParams = {}
            if (info.params) {
                info.params.forEach((paramName, index) => {
                    const value = match[index + 1]
                    if (value !== undefined) {
                        const isCatchAll = info.catchAllParams?.includes(paramName)

                        if (isCatchAll) {
                            params[paramName] = value ? value.split('/').filter(Boolean) : []
                        } else {
                            params[paramName] = value || ''
                        }
                    }
                })
            }
            return { route, params }
        }
    }

    return null
}

export const handleApiRequest = async (request: Request, routes: ApiRouteMap): Promise<Response> => {
    const url = new URL(request.url)
    const pathname = url.pathname

    const matched = matchApiRoute(pathname, routes)

    if (!matched) {
        return new Response(JSON.stringify({ error: 'Not Found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    const routeInfo = routes[matched.route]
    if (!routeInfo) {
        return new Response(JSON.stringify({ error: 'Not Found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    try {
        const module = (await import(routeInfo.filePath)) as ApiRouteModule
        const method = request.method as HttpMethod
        const handler = module[method]

        if (!handler) {
            return new Response(JSON.stringify({ error: `Method ${method} Not Allowed` }), {
                status: 405,
                headers: {
                    'Content-Type': 'application/json',
                    'Allow': Object.keys(module).join(', '),
                },
            })
        }

        const response = await handler(request, { params: matched.params })
        return response
    } catch (error) {
        console.error('API Route Error:', error)
        return new Response(
            JSON.stringify({
                error: 'Internal Server Error',
                message: error instanceof Error ? error.message : 'Unknown error',
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            },
        )
    }
}
