import { readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import type { RouteMap, ApiRouteMap } from './types'

const isGroupRoute = (segment: string) => segment.startsWith('(') && segment.endsWith(')')

const stripGroupRoute = (segment: string) => {
    if (isGroupRoute(segment)) {
        return ''
    }
    return segment
}

const isDynamicSegment = (segment: string) => {
    return segment.startsWith('[') && segment.endsWith(']')
}

const parseDynamicSegment = (segment: string) => {
    if (!isDynamicSegment(segment)) {
        return { isDynamic: false, paramName: null, isCatchAll: false, isOptional: false }
    }

    const inner = segment.slice(1, -1)

    if (inner.startsWith('[...') && inner.endsWith(']')) {
        return { isDynamic: true, paramName: inner.slice(4, -1), isCatchAll: true, isOptional: true }
    }

    if (inner.startsWith('...')) {
        return { isDynamic: true, paramName: inner.slice(3), isCatchAll: true, isOptional: false }
    }

    return { isDynamic: true, paramName: inner, isCatchAll: false, isOptional: false }
}

const buildRoutePattern = (segments: string[]): string => {
    return segments.map(seg => {
        const parsed = parseDynamicSegment(seg)
        if (parsed.isDynamic) {
            if (parsed.isCatchAll) {
                return parsed.isOptional ? `(?:/(.*?))?` : `/(.*)`
            }
            return `/([^/]+)`
        }
        return `/${seg}`
    }).join('') || '/'
}

const scanDirectory = (dir: string, baseDir: string, currentPath: string = '', pathSegments: string[] = []): RouteMap => {
    const routes: RouteMap = {}
    const entries = readdirSync(dir)

    const layoutPath = entries.find((entry) => entry === 'layout.tsx')
    const pagePath = entries.find((entry) => entry === 'page.tsx')
    const errorPath = entries.find((entry) => entry === 'error.tsx')
    const notFoundPath = entries.find((entry) => entry === 'not-found.tsx')
    const loadingPath = entries.find((entry) => entry === 'loading.tsx')

    const urlPath = currentPath || '/'
    const relativePath = currentPath || ''

    const isDynamic = pathSegments.some(seg => isDynamicSegment(seg))
    const params = pathSegments.filter(seg => isDynamicSegment(seg)).map(seg => {
        const parsed = parseDynamicSegment(seg)
        return parsed.paramName || ''
    }).filter(Boolean)

    const catchAllParams = pathSegments.filter(seg => isDynamicSegment(seg)).map(seg => {
        const parsed = parseDynamicSegment(seg)
        return parsed.isCatchAll ? parsed.paramName : null
    }).filter(Boolean) as string[]

    if (!routes[urlPath]) {
        routes[urlPath] = {
            layouts: [],
            isDynamic,
            params,
            catchAllParams,
            pattern: isDynamic ? buildRoutePattern(pathSegments) : undefined
        }
    }

    if (layoutPath) {
        routes[urlPath].layouts.push(join(relativePath, layoutPath))
    }

    if (pagePath) {
        routes[urlPath].page = join(relativePath, pagePath)
    }

    if (errorPath) {
        routes[urlPath].error = join(relativePath, errorPath)
    }

    if (notFoundPath) {
        routes[urlPath].notFound = join(relativePath, notFoundPath)
    }

    if (loadingPath) {
        routes[urlPath].loading = join(relativePath, loadingPath)
    }

    entries.forEach((entry) => {
        const fullPath = join(dir, entry)
        if (statSync(fullPath).isDirectory()) {
            const segment = stripGroupRoute(entry)
            const newPath = segment ? (currentPath ? `${currentPath}/${segment}` : segment) : currentPath
            const newSegments = segment ? [...pathSegments, segment] : pathSegments

            const nestedRoutes = scanDirectory(fullPath, baseDir, newPath, newSegments)

            Object.entries(nestedRoutes).forEach(([path, info]) => {
                const parentRoute = routes[urlPath]
                if (!parentRoute) return

                if (!routes[path]) {
                    routes[path] = {
                        layouts: [...parentRoute.layouts],
                        isDynamic: info.isDynamic,
                        params: info.params,
                        catchAllParams: info.catchAllParams,
                        pattern: info.pattern,
                        error: info.error || parentRoute.error,
                        notFound: info.notFound || parentRoute.notFound,
                        loading: info.loading || parentRoute.loading
                    }
                } else {
                    routes[path].layouts = [...parentRoute.layouts, ...info.layouts]
                }

                if (info.page) {
                    routes[path].page = info.page
                }

                if (info.error) {
                    routes[path].error = info.error
                }

                if (info.notFound) {
                    routes[path].notFound = info.notFound
                }

                if (info.loading) {
                    routes[path].loading = info.loading
                }
            })
        }
    })

    return routes
}

export const scanPages = (pagesDir: string): RouteMap => {
    return scanDirectory(pagesDir, pagesDir)
}

const scanApiDirectory = (dir: string, baseDir: string, currentPath: string = '', pathSegments: string[] = []): ApiRouteMap => {
    const routes: ApiRouteMap = {}

    try {
        const entries = readdirSync(dir)

        entries.forEach((entry) => {
            const fullPath = join(dir, entry)
            const stats = statSync(fullPath)

            if (stats.isDirectory()) {
                const segment = entry
                const newPath = currentPath ? `${currentPath}/${segment}` : segment
                const newSegments = [...pathSegments, segment]

                const nestedRoutes = scanApiDirectory(fullPath, baseDir, newPath, newSegments)
                Object.assign(routes, nestedRoutes)
            } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
                const fileName = entry.replace(/\.tsx?$/, '')
                const urlPath = currentPath ? `/${currentPath}/${fileName}` : `/${fileName}`

                const isDynamic = pathSegments.some(seg => isDynamicSegment(seg)) || isDynamicSegment(fileName)
                const allSegments = [...pathSegments, fileName]
                const params = allSegments.filter(seg => isDynamicSegment(seg)).map(seg => {
                    const parsed = parseDynamicSegment(seg)
                    return parsed.paramName || ''
                }).filter(Boolean)

                const catchAllParams = allSegments.filter(seg => isDynamicSegment(seg)).map(seg => {
                    const parsed = parseDynamicSegment(seg)
                    return parsed.isCatchAll ? parsed.paramName : null
                }).filter(Boolean) as string[]

                routes[urlPath] = {
                    filePath: resolve(fullPath),
                    isDynamic,
                    params,
                    catchAllParams,
                    pattern: isDynamic ? buildRoutePattern(allSegments) : undefined
                }
            }
        })
    } catch (error) {
    }

    return routes
}

export const scanApiRoutes = (pagesDir: string): ApiRouteMap => {
    try {
        const apiDir = join(pagesDir, 'api')
        return scanApiDirectory(apiDir, apiDir)
    } catch (error) {
        return {}
    }
}
