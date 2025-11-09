import type { ImageProps } from '../image/types'

const buildImageUrl = (src: string, width: number, quality: number, format = 'webp') => {
    const params = new URLSearchParams({
        url: src,
        w: width.toString(),
        q: quality.toString(),
        f: format,
    })
    return `/.bunact/image?${params.toString()}`
}

const DEVICE_SIZES = [640, 750, 828, 1080, 1200, 1920, 2048, 3840]

export const Image = ({
    src,
    width,
    height,
    alt,
    quality = 75,
    priority = false,
    loading,
    className,
    style,
    sizes,
    fill = false,
    objectFit = 'cover',
    objectPosition = 'center',
}: ImageProps) => {
    const loadingAttr = priority ? 'eager' : loading || 'lazy'

    let srcSet: string | undefined
    let imgSrc: string
    let imgWidth: number | undefined
    let imgHeight: number | undefined
    let imgStyle = style

    if (fill) {
        srcSet = DEVICE_SIZES.map((size) => `${buildImageUrl(src, size, quality)} ${size}w`).join(', ')
        imgSrc = buildImageUrl(src, DEVICE_SIZES[4] || 1200, quality)
        imgWidth = undefined
        imgHeight = undefined
        imgStyle = {
            ...style,
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit,
            objectPosition,
        }
    } else {
        const actualWidth = width || 800
        srcSet = [
            `${buildImageUrl(src, actualWidth, quality)} 1x`,
            `${buildImageUrl(src, actualWidth * 2, quality)} 2x`,
            `${buildImageUrl(src, actualWidth * 3, quality)} 3x`,
        ].join(', ')
        imgSrc = buildImageUrl(src, actualWidth, quality)
        imgWidth = width
        imgHeight = height
    }

    return (
        <img
            src={imgSrc}
            srcSet={srcSet}
            width={imgWidth}
            height={imgHeight}
            alt={alt}
            loading={loadingAttr}
            className={className}
            style={imgStyle}
            sizes={sizes}
        />
    )
}
