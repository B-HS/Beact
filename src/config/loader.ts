import { join } from 'path'
import type { MeactConfig } from '../types'

export const loadConfig = async (rootDir = process.cwd()): Promise<MeactConfig> => {
    const defaults: MeactConfig = {
        rootDir,
        pagesDir: join(rootDir, 'pages'),
        publicDir: join(rootDir, 'public'),
        cacheDir: join(rootDir, '.meact/cache'),
        port: 3000
    }

    try {
        const userConfigPath = join(rootDir, 'meact.config.ts')
        const userConfig = await import(userConfigPath)
        return { ...defaults, ...userConfig.default }
    } catch {
        return defaults
    }
}
