import { fetch as handleRequest } from '../server'
import { loadConfig } from '../config'
import { wrapServerOnlyCode, clearBundleCache } from '../build'
import { plugin } from 'bun'
import { watch } from 'fs'
import { join } from 'path'
import type { ServerWebSocket } from 'bun'

plugin({
    name: 'meact-server-transform',
    setup(build) {
        build.onLoad({ filter: /pages\/.*\.tsx$/ }, async (args) => {
            const code = await Bun.file(args.path).text()
            const transformed = wrapServerOnlyCode(code, args.path)
            return {
                contents: transformed,
                loader: 'tsx',
            }
        })
    },
})

const clients = new Set<ServerWebSocket<unknown>>()

const clearAllCaches = () => {
    const caches = [
        require.cache,
        (globalThis as any).Bun?.main?.loader?.cache,
    ]

    for (const cache of caches) {
        if (cache) {
            for (const key in cache) {
                delete cache[key]
            }
        }
    }
}

export const dev = async () => {
    const rootDir = process.cwd()
    const config = await loadConfig(rootDir)

    console.log(`Meact dev server starting on port ${config.port}...`)
    console.log(`Project root: ${config.rootDir}`)
    console.log(`Pages directory: ${config.pagesDir}`)

    const server = Bun.serve({
        port: config.port,
        fetch: (request, server) => {
            const url = new URL(request.url)

            if (url.pathname === '/.meact/hmr') {
                const success = server.upgrade(request)
                if (success) {
                    return undefined
                }
                return new Response('WebSocket upgrade failed', { status: 400 })
            }

            if (url.pathname === '/.meact/hmr.js') {
                const hmrClientPath = join(import.meta.dir, '../dev/hmr-client.ts')
                return new Response(Bun.file(hmrClientPath), {
                    headers: { 'content-type': 'application/javascript' },
                })
            }

            return handleRequest(request, config)
        },
        websocket: {
            open(ws) {
                clients.add(ws)
                console.log('[HMR] Client connected')
            },
            message() {},
            close(ws) {
                clients.delete(ws)
                console.log('[HMR] Client disconnected')
            },
        },
        development: true,
    })

    let reloadTimeout: Timer | null = null

    try {
        watch(rootDir, { recursive: true }, () => {
            if (reloadTimeout) {
                clearTimeout(reloadTimeout)
            }

            reloadTimeout = setTimeout(() => {
                console.log('[HMR] File changed, reloading...')
                clearAllCaches()
                clearBundleCache()

                for (const client of clients) {
                    client.send(JSON.stringify({ type: 'reload' }))
                }
            }, 100)
        })
        console.log(`Watching: ${rootDir}`)
    } catch (err) {
        console.log(`Could not watch: ${rootDir}`)
    }

    console.log(`Ready at http://localhost:${config.port}`)
}

if (import.meta.main) {
    dev()
}
