import { scanPages } from './scanner'
import { join } from 'path'
import type { ReactElement } from 'react'
import type { ComponentFactory, ComponentFactoryResult, RouteParams, Metadata, PageProps, ResolvedBunactConfig } from '../types'

export const ssrCache = new WeakMap<ComponentFactory, ComponentFactoryResult>()

const matchRoute = (pathname: string, routes: ReturnType<typeof scanPages>) => {
    const normalizedPath = pathname === '/' ? '/' : pathname.slice(1)

    const exactMatch = routes[normalizedPath]
    if (exactMatch && !exactMatch.isDynamic) {
        return { routeInfo: exactMatch, params: {} }
    }

    const dynamicRoutes = Object.entries(routes).filter(([_, info]) => info.isDynamic && info.pattern)

    for (const [_, routeInfo] of dynamicRoutes) {
        if (!routeInfo.pattern) continue

        const regex = new RegExp(`^${routeInfo.pattern}$`)
        const match = pathname.match(regex)

        if (match) {
            const params: RouteParams = {}
            const paramNames = routeInfo.params || []

            paramNames.forEach((paramName, index) => {
                const value = match[index + 1]
                if (value !== undefined) {
                    const isCatchAll = routeInfo.catchAllParams?.includes(paramName)

                    if (isCatchAll) {
                        params[paramName] = value ? value.split('/').filter(Boolean) : []
                    } else {
                        params[paramName] = value || ''
                    }
                }
            })

            return { routeInfo, params }
        }
    }

    return null
}

export const collectMetadata = async (layouts: ComponentFactory[], page: ComponentFactory, pageProps: PageProps = {}): Promise<Metadata[]> => {
    const metadataList: Metadata[] = []

    for (const layout of layouts) {
        const layoutFactory = await layout.default({ ...pageProps, children: null })
        if (layoutFactory.metadata && Array.isArray(layoutFactory.metadata)) {
            metadataList.push(...layoutFactory.metadata)
        }
    }

    const pageFactory = await page.default(pageProps)
    if (pageFactory.metadata && Array.isArray(pageFactory.metadata)) {
        metadataList.push(...pageFactory.metadata)
    }

    return metadataList
}

export const getNotFoundComponent = async (pathname: string, config: ResolvedBunactConfig) => {
    const routes = scanPages(config.pagesDir)

    const segments = pathname === '/' ? [] : pathname.split('/').filter(Boolean)

    for (let i = segments.length; i >= 0; i--) {
        const checkPath = i === 0 ? '/' : segments.slice(0, i).join('/')
        const routeInfo = routes[checkPath]

        if (routeInfo?.notFound) {
            const layoutModules: ComponentFactory[] = []
            for (const layoutPath of routeInfo.layouts) {
                const mod = (await import(join(config.pagesDir, layoutPath))) as ComponentFactory
                layoutModules.push(mod)
            }

            const notFoundModule = (await import(join(config.pagesDir, routeInfo.notFound))) as ComponentFactory

            return {
                layouts: layoutModules,
                notFound: notFoundModule,
                layoutPaths: routeInfo.layouts,
                notFoundPath: routeInfo.notFound,
            }
        }
    }

    const rootRoute = routes['/']
    const layoutModules: ComponentFactory[] = []
    if (rootRoute) {
        for (const layoutPath of rootRoute.layouts) {
            const mod = (await import(join(config.pagesDir, layoutPath))) as ComponentFactory
            layoutModules.push(mod)
        }
    }

    const defaultNotFoundModule = (await import('../ui/not-found')) as ComponentFactory

    return {
        layouts: layoutModules,
        notFound: defaultNotFoundModule,
        layoutPaths: rootRoute?.layouts || [],
        notFoundPath: '../ui/not-found',
    }
}

export const getRouteComponents = async (pathname: string, config: ResolvedBunactConfig) => {
    const routes = scanPages(config.pagesDir)
    const matchResult = matchRoute(pathname, routes)

    if (!matchResult || !matchResult.routeInfo.page) {
        return null
    }

    const { routeInfo, params } = matchResult
    const pagePath = routeInfo.page!

    const layoutModules: ComponentFactory[] = []
    for (const layoutPath of routeInfo.layouts) {
        const mod = (await import(join(config.pagesDir, layoutPath))) as ComponentFactory
        layoutModules.push(mod)
    }

    const pageModule = (await import(join(config.pagesDir, pagePath))) as ComponentFactory
    const revalidate = pageModule.revalidate ?? false

    let errorModule: ComponentFactory | null = null
    if (routeInfo.error) {
        errorModule = (await import(join(config.pagesDir, routeInfo.error))) as ComponentFactory
    }

    let loadingModule: ComponentFactory
    if (routeInfo.loading) {
        loadingModule = (await import(join(config.pagesDir, routeInfo.loading))) as ComponentFactory
    } else {
        loadingModule = (await import('../ui/loading')) as ComponentFactory
    }

    const metadata = await collectMetadata(layoutModules, pageModule, params)

    return {
        layouts: layoutModules,
        page: pageModule,
        error: errorModule,
        loading: loadingModule,
        layoutPaths: routeInfo.layouts,
        pagePath,
        errorPath: routeInfo.error,
        loadingPath: routeInfo.loading || '../ui/loading',
        params,
        metadata,
        revalidate,
    }
}

export const buildComponentTree = async (
    layouts: ComponentFactory[],
    page: ComponentFactory,
    pageProps: PageProps = {},
    metadata: Metadata[] = [],
): Promise<ReactElement> => {
    const pageFactory = await page.default(pageProps)
    ssrCache.set(page, pageFactory)
    const PageComponent = await pageFactory.default()

    if (layouts.length === 0) {
        return PageComponent
    }

    let tree: ReactElement = PageComponent

    for (let i = layouts.length - 1; i >= 0; i--) {
        const layout = layouts[i]
        if (!layout) continue
        const isRootLayout = i === 0
        const layoutFactory = await layout.default({
            children: tree,
            ...pageProps,
            ...(isRootLayout && { metadata }),
        })
        ssrCache.set(layout, layoutFactory)
        tree = await layoutFactory.default()
    }

    return tree
}
