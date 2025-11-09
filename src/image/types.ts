import type { ReactNode, CSSProperties } from 'react'

export type ImageFormat = 'webp' | 'avif' | 'jpeg' | 'png'

export interface ImageOptimizationOptions {
    width?: number
    height?: number
    quality?: number
    format?: ImageFormat
}

export interface ImageCacheEntry {
    buffer: Buffer
    format: ImageFormat
    width: number
    height: number
    timestamp: number
}

export interface ImageProps {
    src: string
    width?: number
    height?: number
    alt: string
    quality?: number
    priority?: boolean
    loading?: 'lazy' | 'eager'
    placeholder?: 'blur' | 'empty'
    blurDataURL?: string
    sizes?: string
    fill?: boolean
    objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
    objectPosition?: string
    className?: string
    style?: CSSProperties
}
