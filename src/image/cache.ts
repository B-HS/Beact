import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import type { ImageFormat } from './types'

const MAX_CACHE_SIZE = parseInt(process.env.BEACT_IMAGE_CACHE_SIZE || '500') * 1024 * 1024

const getCacheDir = (cacheDir: string) => {
    return resolve(cacheDir, 'images')
}

export const getCacheKey = (src: string, width: number, quality: number, format: ImageFormat): string => {
    const hash = createHash('md5').update(src).digest('hex').slice(0, 12)
    return `${hash}_${width}_${quality}_${format}`
}

export const getCachedImage = async (cacheKey: string, format: ImageFormat, cacheDir: string): Promise<Buffer | null> => {
    const imageCacheDir = getCacheDir(cacheDir)
    const filePath = resolve(imageCacheDir, `${cacheKey}.${format}`)
    if (!existsSync(filePath)) return null

    try {
        return readFileSync(filePath)
    } catch {
        return null
    }
}

export const setCachedImage = async (cacheKey: string, format: ImageFormat, buffer: Buffer, cacheDir: string): Promise<void> => {
    const imageCacheDir = getCacheDir(cacheDir)
    if (!existsSync(imageCacheDir)) {
        mkdirSync(imageCacheDir, { recursive: true })
    }

    const filePath = resolve(imageCacheDir, `${cacheKey}.${format}`)

    try {
        writeFileSync(filePath, buffer)
    } catch (error) {
        console.error('Failed to write image cache:', error)
    }
}
