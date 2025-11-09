export interface BeactConstants {
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

export const defaultConstants: BeactConstants = {
    server: {
        defaultPort: getEnvInt('PORT', 3000),
        bundleDir: '.beact-bundles',
        hmrEndpoint: '/.beact/hmr',
        hmrClientPath: '/.beact/hmr.js',
        imageEndpoint: '/.beact/image',
    },
    build: {
        tempDirName: '.beact-temp',
        bundleDirName: '.beact-bundles',
        standaloneOutputDir: '.beact',
    },
    cache: {
        maxIsrCacheSize: getEnvInt('BEACT_ISR_MAX_CACHE_SIZE', 1000),
        maxImageCacheSizeMB: getEnvInt('BEACT_IMAGE_CACHE_SIZE', 500),
        cacheDir: '.beact/cache',
        imageCacheSubdir: 'images',
    },
    paths: {
        pagesDir: 'pages',
        publicDir: 'public',
        componentsDir: 'components',
        proxyFile: 'proxy.ts',
    },
    publicEnvPrefix: 'BEACT_PUBLIC_',
}

export const getConstants = (overrides?: Partial<BeactConstants>): BeactConstants => {
    if (!overrides) return defaultConstants

    return {
        server: { ...defaultConstants.server, ...overrides.server },
        build: { ...defaultConstants.build, ...overrides.build },
        cache: { ...defaultConstants.cache, ...overrides.cache },
        paths: { ...defaultConstants.paths, ...overrides.paths },
        publicEnvPrefix: overrides.publicEnvPrefix || defaultConstants.publicEnvPrefix,
    }
}
