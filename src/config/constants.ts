export interface MeactConstants {
    server: {
        defaultPort: number
        bundleDir: string
        hmrEndpoint: string
        hmrClientPath: string
        imageEndpoint: string
    }
    build: {
        tempDirName: string
        bundleDirName: string
        standaloneOutputDir: string
    }
    cache: {
        maxIsrCacheSize: number
        maxImageCacheSizeMB: number
        cacheDir: string
        imageCacheSubdir: string
    }
    paths: {
        pagesDir: string
        publicDir: string
        componentsDir: string
        proxyFile: string
    }
    publicEnvPrefix: string
}

const getEnv = (key: string, defaultValue: string): string => {
    return process.env[key] || defaultValue
}

const getEnvInt = (key: string, defaultValue: number): number => {
    const value = process.env[key]
    return value ? parseInt(value, 10) : defaultValue
}

export const defaultConstants: MeactConstants = {
    server: {
        defaultPort: getEnvInt('PORT', 3000),
        bundleDir: '.meact-bundles',
        hmrEndpoint: '/.meact/hmr',
        hmrClientPath: '/.meact/hmr.js',
        imageEndpoint: '/.meact/image',
    },
    build: {
        tempDirName: '.meact-temp',
        bundleDirName: '.meact-bundles',
        standaloneOutputDir: '.meact',
    },
    cache: {
        maxIsrCacheSize: getEnvInt('MEACT_ISR_MAX_CACHE_SIZE', 1000),
        maxImageCacheSizeMB: getEnvInt('MEACT_IMAGE_CACHE_SIZE', 500),
        cacheDir: '.meact/cache',
        imageCacheSubdir: 'images',
    },
    paths: {
        pagesDir: 'pages',
        publicDir: 'public',
        componentsDir: 'components',
        proxyFile: 'proxy.ts',
    },
    publicEnvPrefix: 'MEACT_PUBLIC_',
}

export const getConstants = (overrides?: Partial<MeactConstants>): MeactConstants => {
    if (!overrides) return defaultConstants

    return {
        server: { ...defaultConstants.server, ...overrides.server },
        build: { ...defaultConstants.build, ...overrides.build },
        cache: { ...defaultConstants.cache, ...overrides.cache },
        paths: { ...defaultConstants.paths, ...overrides.paths },
        publicEnvPrefix: overrides.publicEnvPrefix || defaultConstants.publicEnvPrefix,
    }
}
