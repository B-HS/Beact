import { createHydrateScript } from './hydrate'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { wrapServerOnlyCode, hasUseClientDirective } from './transform'
import { getPublicEnvVars } from '../config/env'
import type { BunPlugin } from 'bun'
import type { ResolvedBunactConfig, BundleContext, CSSHandler, LoadHandler, ResolveHandler } from '../types'

const bundleCache = new Map<string, { outputDir: string; mainScript: string }>()

const generateBundleId = (pathname: string) => {
    return createHash('md5').update(pathname).digest('hex')
}

export const createClientBundle = async (
    layoutPaths: string[],
    pagePath: string,
    config: ResolvedBunactConfig,
    errorPath?: string,
    pathname?: string,
    loadingPath?: string,
) => {
    if (!pathname) {
        pathname = pagePath
    }
    const bundleId = generateBundleId(pathname)

    if (bundleCache.has(bundleId)) {
        const cached = bundleCache.get(bundleId)!
        return { bundleId, outputDir: cached.outputDir, mainScript: cached.mainScript }
    }

    const cwd = config.rootDir
    const pagesDir = join(cwd, 'pages')

    const resolveImportPath = (path: string) => {
        if (path.startsWith('../')) {
            return path.replace('../', 'bunact/')
        }
        return join(pagesDir, path)
    }

    const absoluteLayoutPaths = layoutPaths.map((path) => join(pagesDir, path))
    const absolutePagePath = resolveImportPath(pagePath)
    const absoluteErrorPath = errorPath ? (errorPath.startsWith('../') ? errorPath.replace('../', 'bunact/') : errorPath) : undefined
    const absoluteLoadingPath = loadingPath ? (loadingPath.startsWith('../') ? loadingPath.replace('../', 'bunact/') : loadingPath) : undefined

    const hydrateScript = createHydrateScript(absoluteLayoutPaths, absolutePagePath, absoluteErrorPath, absoluteLoadingPath)

    const tempDir = join(cwd, '.bunact-temp')
    mkdirSync(tempDir, { recursive: true })
    const tempFile = join(tempDir, `${bundleId}.tsx`)

    writeFileSync(tempFile, hydrateScript)

    const serverOnlyPlugin: BunPlugin = {
        name: 'server-only-transform',
        setup(build) {
            build.onResolve({ filter: /^bunact\/ui\// }, (args) => {
                const uiPath = args.path.replace('bunact/ui/', '')
                return {
                    path: join(cwd, 'node_modules', 'bunact', 'dist', 'ui', uiPath + '.js'),
                }
            })

            build.onResolve({ filter: /^bunact\/router$/ }, () => {
                return {
                    path: join(cwd, 'node_modules', 'bunact', 'dist', 'router', 'index.js'),
                }
            })

            build.onResolve({ filter: /^bunact\/context\/promise$/ }, () => {
                return {
                    path: join(cwd, 'node_modules', 'bunact', 'dist', 'context', 'promise.js'),
                    namespace: 'context-promise-stub',
                }
            })

            build.onLoad({ filter: /.*/, namespace: 'context-promise-stub' }, async () => {
                return {
                    contents: `
                        export const promiseStorage = null;
                        export const getPromiseCache = () => new Map();
                        export const setPromiseCacheValue = () => {};
                        export const getPromiseCacheValue = () => undefined;
                    `,
                    loader: 'ts',
                }
            })

            build.onLoad({ filter: /\.(tsx|ts)$/ }, async (args) => {
                const code = await Bun.file(args.path).text()

                if (hasUseClientDirective(code)) {
                    const cleanCode = code.replace(/^["']use client["'];?\s*\n?/m, '')
                    return {
                        contents: cleanCode,
                        loader: 'tsx',
                    }
                }

                if (args.path.includes('/pages/')) {
                    const transformed = wrapServerOnlyCode(code, args.path)
                    return {
                        contents: transformed,
                        loader: 'tsx',
                    }
                }

                return {
                    contents: code,
                    loader: 'tsx',
                }
            })
        },
    }

    const bundleContext: BundleContext = {
        rootDir: config.rootDir,
        pagesDir: config.pagesDir,
        cacheDir: config.cacheDir,
        bundleId,
        pathname: pathname || pagePath,
    }

    const userPlugins =
        config.plugins
            ?.map((p) => {
                if (!p.bundlePlugin) return null

                if (typeof p.bundlePlugin === 'function') {
                    return p.bundlePlugin(bundleContext)
                }
                return p.bundlePlugin
            })
            .filter((p): p is BunPlugin => p !== null) ?? []

    const cssInjectorPlugin: BunPlugin = {
        name: 'css-injector-wrapper',
        setup(build) {
            const cssHandlers: CSSHandler[] = []
            const nonCssHandlers: Array<LoadHandler | ResolveHandler> = []

            for (const plugin of userPlugins) {
                const mockBuild = {
                    onLoad: (opts: { filter: RegExp; namespace?: string }, handler: CSSHandler['handler']) => {
                        if (/\.css/.test(opts.filter.source)) {
                            cssHandlers.push({ filter: opts.filter, handler })
                        } else {
                            nonCssHandlers.push({ type: 'load', opts, handler })
                        }
                    },
                    onResolve: (opts: { filter: RegExp; namespace?: string }, handler: ResolveHandler['handler']) => {
                        nonCssHandlers.push({ type: 'resolve', opts, handler })
                    },
                    onStart: () => {},
                    onEnd: () => {},
                    onBeforeParse: () => {},
                    config: {},
                    module: () => {},
                }
                plugin.setup?.(mockBuild as unknown as import('bun').PluginBuilder)
            }

            for (const item of nonCssHandlers) {
                if (item.type === 'load') {
                    build.onLoad(item.opts, item.handler)
                } else {
                    build.onResolve(item.opts, item.handler)
                }
            }

            build.onLoad({ filter: /\.css$/ }, async (args) => {
                let processedCSS = await Bun.file(args.path).text()

                for (const { filter, handler } of cssHandlers) {
                    if (filter.test(args.path)) {
                        const result = await handler(args)
                        if (result && typeof result === 'object' && 'contents' in result) {
                            const contents = result.contents
                            processedCSS = typeof contents === 'string' ? contents : new TextDecoder().decode(contents)
                        }
                    }
                }

                const jsCode = `
const style = document.createElement('style');
style.textContent = ${JSON.stringify(processedCSS)};
document.head.appendChild(style);
export default ${JSON.stringify(processedCSS)};
`
                return {
                    contents: jsCode,
                    loader: 'js',
                }
            })
        },
    }

    try {
        const outputDir = join(cwd, '.bunact-bundles', bundleId)
        mkdirSync(outputDir, { recursive: true })

        const result = await Bun.build({
            entrypoints: [tempFile],
            target: 'browser',
            format: 'esm',
            minify: true,
            splitting: true,
            outdir: outputDir,
            naming: '[name]-[hash].[ext]',
            plugins: [serverOnlyPlugin, cssInjectorPlugin],
            define: {
                'process.env.NODE_ENV': '"production"',
                ...getPublicEnvVars(),
            },
        })

        if (!result.success) {
            throw new Error('Bundle failed')
        }

        const mainOutput = result.outputs.find((o) => o.path.includes(bundleId))
        if (!mainOutput) {
            throw new Error('No main bundle output generated')
        }

        const mainScript = mainOutput.path.split('/').pop()!
        bundleCache.set(bundleId, { outputDir, mainScript })

        rmSync(tempDir, { recursive: true, force: true })

        return { bundleId, outputDir, mainScript }
    } catch (error) {
        rmSync(tempDir, { recursive: true, force: true })
        throw error
    }
}

export const getBundleOutputDir = (bundleId: string) => {
    return bundleCache.get(bundleId)?.outputDir
}

export const clearBundleCache = () => {
    bundleCache.clear()
}
