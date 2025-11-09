import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { getCacheKey, getCachedImage, setCachedImage } from '../image/cache'
import { optimizeImage } from '../image/optimizer'
import type { ImageFormat } from '../image/types'

const validateImageParams = (params: { url: string | null; w: number; h: number; q: number; f: string }) => {
    if (!params.url || params.url.includes('..')) {
        throw new Error('Invalid image URL')
    }

    if (params.w > 5000 || params.h > 5000) {
        throw new Error('Image size too large (max 5000px)')
    }

    if (params.q < 1 || params.q > 100) {
        throw new Error('Invalid quality (1-100)')
    }

    const validFormats: ImageFormat[] = ['webp', 'avif', 'jpeg', 'png']
    if (!validFormats.includes(params.f as ImageFormat)) {
        throw new Error('Invalid format')
    }
}

export const handleImageRequest = async (request: Request, cacheDir: string): Promise<Response> => {
    try {
        const url = new URL(request.url)
        const params = {
            url: url.searchParams.get('url'),
            w: parseInt(url.searchParams.get('w') || '0'),
            h: parseInt(url.searchParams.get('h') || '0'),
            q: parseInt(url.searchParams.get('q') || '75'),
            f: (url.searchParams.get('f') || 'webp') as ImageFormat,
        }

        validateImageParams(params)

        if (!params.url) {
            return new Response('Missing url parameter', { status: 400 })
        }

        const cacheKey = getCacheKey(params.url, params.w, params.q, params.f)

        let imageBuffer = await getCachedImage(cacheKey, params.f, cacheDir)

        if (!imageBuffer) {
            const originalPath = resolve(process.cwd(), 'public', params.url.replace(/^\//, ''))

            if (!existsSync(originalPath)) {
                return new Response('Image not found', { status: 404 })
            }

            const originalBuffer = readFileSync(originalPath)

            imageBuffer = await optimizeImage(originalBuffer, {
                width: params.w || undefined,
                height: params.h || undefined,
                quality: params.q,
                format: params.f,
            })

            await setCachedImage(cacheKey, params.f, imageBuffer, cacheDir)
        }

        return new Response(imageBuffer as unknown as BodyInit, {
            headers: {
                'Content-Type': `image/${params.f}`,
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        })
    } catch (error) {
        console.error('Image optimization error:', error)
        return new Response(error instanceof Error ? error.message : 'Image optimization failed', { status: 500 })
    }
}
