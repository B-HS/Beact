import { resolve } from 'path'
import { existsSync, statSync } from 'fs'
import type { ResolvedMeactConfig } from '../types'

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain',
    '.xml': 'application/xml',
    '.pdf': 'application/pdf',
}

export const getMimeType = (filePath: string) => {
    const ext = filePath.substring(filePath.lastIndexOf('.'))
    return MIME_TYPES[ext] || 'application/octet-stream'
}

export const serveStaticFile = async (request: Request, config: ResolvedMeactConfig) => {
    const url = new URL(request.url)
    const pathname = url.pathname

    const safePath = pathname.replace(/\.\./g, '').replace(/^\//, '')
    const publicDir = config.publicDir
    const filePath = resolve(publicDir, safePath)

    if (!filePath.startsWith(publicDir)) {
        return new Response('Forbidden', { status: 403 })
    }

    if (!existsSync(filePath)) {
        return null
    }

    const stats = statSync(filePath)
    if (!stats.isFile()) {
        return null
    }

    try {
        const file = Bun.file(filePath)
        const mimeType = getMimeType(filePath)

        return new Response(file, {
            headers: {
                'Content-Type': mimeType,
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        })
    } catch (error) {
        console.error('Error serving static file:', error)
        return new Response('Internal Server Error', { status: 500 })
    }
}
