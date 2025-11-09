import sharp from 'sharp'
import type { ImageOptimizationOptions } from './types'

export const optimizeImage = async (inputBuffer: Buffer, options: ImageOptimizationOptions): Promise<Buffer> => {
    let pipeline = sharp(inputBuffer)

    if (options.width || options.height) {
        pipeline = pipeline.resize(options.width, options.height, {
            fit: 'inside',
            withoutEnlargement: true,
        })
    }

    const quality = options.quality || 75

    switch (options.format) {
        case 'webp':
            pipeline = pipeline.webp({ quality })
            break
        case 'avif':
            pipeline = pipeline.avif({ quality })
            break
        case 'jpeg':
            pipeline = pipeline.jpeg({ quality })
            break
        case 'png':
            pipeline = pipeline.png({ quality })
            break
        default:
            pipeline = pipeline.webp({ quality })
    }

    return pipeline.toBuffer()
}
