import { join } from 'path'
import type { ProxyHandler } from '../types'

export const runProxyChain = async (request: Request, handlers: ProxyHandler[]) => {
    let current: Request | Response = request

    for (const handler of handlers) {
        if (current instanceof Response) {
            return current
        }
        current = await handler(current)
    }

    return current
}

let proxyCache: ProxyHandler[] | null = null

export const loadUserProxy = async (rootDir: string): Promise<ProxyHandler[]> => {
    if (proxyCache !== null) {
        return proxyCache
    }

    try {
        const proxyPath = join(rootDir, 'proxy')
        const proxyModule = await import(proxyPath) as any
        if (proxyModule.proxy) {
            proxyCache = [proxyModule.proxy]
            return proxyCache
        }
        if (proxyModule.proxies && Array.isArray(proxyModule.proxies)) {
            proxyCache = proxyModule.proxies as ProxyHandler[]
            return proxyCache
        }
        proxyCache = []
        return proxyCache
    } catch (error) {
        proxyCache = []
        return proxyCache
    }
}
