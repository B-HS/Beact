import { getRouteComponents, getNotFoundComponent, buildComponentTree } from '../router/router'
import { createClientBundle, getBundleFromCache } from '../build/bundler'
import { promiseStorage } from '../context/promise'
import { scanApiRoutes, handleApiRequest } from '../router'
import { loadUserProxy, runProxyChain } from './proxy'
import { serveStaticFile } from './static'
import { isrCache } from './isr-cache'
import { handleImageRequest } from './image-handler'
import type { PageProps, SerializablePageProps, MeactConfig } from '../types'

let apiRoutesCache: ReturnType<typeof scanApiRoutes> | null = null
let renderToReadableStream: any = null

const parseCookies = (cookieHeader: string | null) => {
    const cookies: Record<string, string> = {}
    if (!cookieHeader) return cookies

    cookieHeader.split(';').forEach((cookie) => {
        const [key, ...valueParts] = cookie.split('=')
        if (key) {
            const trimmedKey = key.trim()
            const value = valueParts.join('=').trim()
            cookies[trimmedKey] = value
        }
    })

    return cookies
}

const extractPageProps = (request: Request) => {
    const url = new URL(request.url)
    const searchParamsMap = new Map<string, string[]>()

    for (const [key, value] of url.searchParams.entries()) {
        const existing = searchParamsMap.get(key)
        if (existing) {
            existing.push(value)
        } else {
            searchParamsMap.set(key, [value])
        }
    }

    const searchParams: Record<string, string | string[]> = {}
    for (const [key, values] of searchParamsMap.entries()) {
        searchParams[key] = values.length === 1 ? values[0]! : values
    }

    const cookies = parseCookies(request.headers.get('cookie'))

    const pageProps: Omit<PageProps, 'params'> = {
        searchParams,
        cookies,
        headers: request.headers,
    }

    return pageProps
}

const serializePageProps = (pageProps: PageProps): SerializablePageProps => {
    try {
        const headersRecord: Record<string, string> = {}

        if (pageProps.headers) {
            try {
                pageProps.headers.forEach((value, key) => {
                    headersRecord[key] = value
                })
            } catch (err) {
                console.error('Failed to serialize headers:', err)
            }
        }

        return {
            params: pageProps.params || {},
            searchParams: pageProps.searchParams || {},
            cookies: pageProps.cookies || {},
            headers: headersRecord
        }
    } catch (err) {
        console.error('Failed to serialize PageProps:', err)
        return {
            params: pageProps.params || {},
            searchParams: {},
            cookies: {},
            headers: {}
        }
    }
}

export const fetch = async (request: Request, config: MeactConfig) => {
    if (!renderToReadableStream) {
        const reactDomServerPath = `${config.rootDir}/node_modules/react-dom/server`
        const reactDomServer = await import(reactDomServerPath)
        renderToReadableStream = reactDomServer.renderToReadableStream
    }

    const proxyHandlers = await loadUserProxy(config.rootDir)
    if (proxyHandlers.length > 0) {
        const result = await runProxyChain(request, proxyHandlers)
        if (result instanceof Response) {
            return result
        }
        request = result
    }

    const url = new URL(request.url)
    const pathname = url.pathname

    if (pathname === '/.meact/image') {
        return handleImageRequest(request, config.cacheDir)
    }

    const staticResponse = await serveStaticFile(request, config)
    if (staticResponse) {
        return staticResponse
    }

    if (pathname.startsWith('/.meact/') && pathname.endsWith('.js')) {
        const bundleId = pathname.replace('/.meact/', '').replace('.js', '')
        const bundleCode = getBundleFromCache(bundleId)

        if (bundleCode) {
            return new Response(bundleCode, {
                headers: { 'content-type': 'application/javascript' },
            })
        }

        return new Response('Bundle not found', { status: 404 })
    }

    if (pathname.startsWith('/api/')) {
        if (!apiRoutesCache) {
            apiRoutesCache = scanApiRoutes(config.pagesDir)
        }
        return handleApiRequest(request, apiRoutesCache)
    }

    ;(globalThis as any).__meactSetPromiseCacheValue = (key: string, value: any) => {
        const store = promiseStorage.getStore()
        if (store) {
            store.set(key, value)
        }
    }

    const cache = new Map<string, any>()

    return promiseStorage.run(cache, async () => {
        const basePageProps = extractPageProps(request)
        const routeComponents = await getRouteComponents(pathname, config)

        if (!routeComponents) {
            const notFoundComponents = await getNotFoundComponent(pathname, config)

            if (notFoundComponents) {
                const { layouts, notFound, layoutPaths, notFoundPath } = notFoundComponents

                const pageProps: PageProps = { ...basePageProps, params: {} }
                const notFoundTree = await buildComponentTree(layouts, notFound, pageProps)

                const { bundleId } = await createClientBundle(layoutPaths, notFoundPath, config.rootDir, undefined, pathname)

                const promiseCache = Object.fromEntries(cache.entries())
                const serializedCache = JSON.stringify(promiseCache)
                const serializedPageProps = JSON.stringify(serializePageProps(pageProps))

                const stream = await renderToReadableStream(notFoundTree, {
                    bootstrapScriptContent: `window.__MEACT_PROMISE_CACHE__=${serializedCache};window.__MEACT_PAGE_PROPS__=${serializedPageProps}`,
                    bootstrapScripts: [`/.meact/${bundleId}.js`],
                })

                return new Response(stream, {
                    status: 404,
                    headers: { 'content-type': 'text/html' },
                })
            }

            return new Response('Not Found', { status: 404 })
        }

        const { layouts, page, layoutPaths, pagePath, errorPath, loadingPath, params, metadata, revalidate } = routeComponents
        const pageProps: PageProps = { ...basePageProps, params }

        const { bundleId } = await createClientBundle(layoutPaths, pagePath, config.rootDir, errorPath, pathname, loadingPath)

        const cacheKey = `${pathname}:${JSON.stringify(params)}`
        const cacheResult = isrCache.get(cacheKey)

        if (cacheResult.type === 'fresh') {
            return new Response(cacheResult.html, {
                headers: { 'content-type': 'text/html' },
            })
        }

        if (cacheResult.type === 'stale') {
            isrCache.startRevalidation(cacheKey, async () => {
                const renderCache = new Map<string, any>()
                return promiseStorage.run(renderCache, async () => {
                    const componentTree = await buildComponentTree(layouts, page, pageProps, metadata)
                    const promiseCache = Object.fromEntries(renderCache.entries())
                    const serializedCache = JSON.stringify(promiseCache)
                    const serializedPageProps = JSON.stringify(serializePageProps(pageProps))
                    const stream = await renderToReadableStream(componentTree, {
                        bootstrapScriptContent: `window.__MEACT_PROMISE_CACHE__=${serializedCache};window.__MEACT_PAGE_PROPS__=${serializedPageProps}`,
                        bootstrapScripts: [`/.meact/${bundleId}.js`],
                    })
                    return await new Response(stream).text()
                })
            })

            return new Response(cacheResult.html, {
                headers: { 'content-type': 'text/html' },
            })
        }

        const componentTree = await buildComponentTree(layouts, page, pageProps, metadata)

        const promiseCache = Object.fromEntries(cache.entries())
        const serializedCache = JSON.stringify(promiseCache)
        const serializedPageProps = JSON.stringify(serializePageProps(pageProps))

        const stream = await renderToReadableStream(componentTree, {
            bootstrapScriptContent: `window.__MEACT_PROMISE_CACHE__=${serializedCache};window.__MEACT_PAGE_PROPS__=${serializedPageProps}`,
            bootstrapScripts: [`/.meact/${bundleId}.js`],
        })

        if (revalidate !== false && revalidate !== undefined) {
            const html = await new Response(stream).text()
            isrCache.set(cacheKey, html, revalidate)
            return new Response(html, {
                headers: { 'content-type': 'text/html' },
            })
        }

        return new Response(stream, {
            headers: { 'content-type': 'text/html' },
        })
    })
}
