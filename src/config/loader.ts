import { join } from 'path'
import { existsSync } from 'fs'
import type { BunactConfig, ResolvedBunactConfig } from '../types'
import { getConstants, defaultConstants } from './constants'

export const loadConfig = async (rootDir = process.cwd()): Promise<ResolvedBunactConfig> => {
    const defaults: BunactConfig = {
        rootDir,
        pagesDir: join(rootDir, defaultConstants.paths.pagesDir),
        publicDir: join(rootDir, defaultConstants.paths.publicDir),
        cacheDir: join(rootDir, defaultConstants.cache.cacheDir),
        port: defaultConstants.server.defaultPort,
    }

    let userConfig: Partial<BunactConfig> = {}

    const possiblePaths = [join(rootDir, 'bunact.config.ts'), join(rootDir, 'bunact.config.js'), join(rootDir, 'bunact.config.mjs')]

    for (const configPath of possiblePaths) {
        if (existsSync(configPath)) {
            try {
                const imported = await import(configPath)
                userConfig = imported.default || imported
                break
            } catch (error) {
                console.warn(`Failed to load config from ${configPath}:`, error)
            }
        }
    }

    const merged = { ...defaults, ...userConfig }
    const constants = getConstants(merged.constants)

    if (merged.plugins) {
        for (const plugin of merged.plugins) {
            if (plugin.setup) {
                await plugin.setup(merged)
            }
        }
    }

    return {
        rootDir: merged.rootDir!,
        pagesDir: merged.pagesDir!,
        publicDir: merged.publicDir!,
        cacheDir: merged.cacheDir!,
        port: merged.port!,
        plugins: merged.plugins,
        constants,
    }
}
