import { createHydrateScript } from './hydrate'
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { builtinModules } from 'module'
import { wrapServerOnlyCode, hasUseClientDirective, extractPageComponent } from './transform'
import type { BunPlugin } from 'bun'
import type { ResolvedBunactConfig, BundleContext, CSSHandler, LoadHandler, ResolveHandler } from '../types'

const bundleCache = new Map<string, { outputDir: string; mainScript: string; cssFile?: string }>()

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
        return { bundleId, outputDir: cached.outputDir, mainScript: cached.mainScript, cssFile: cached.cssFile }
    }

    const cwd = config.rootDir
    const pagesDir = join(cwd, 'pages')

    const resolveImportPath = (path: string) => {
        if (path.startsWith('../')) {
            const relativePath = path.replace('../', '')
            return join(cwd, 'node_modules', 'bunact', 'dist', relativePath + '.js')
        }
        return join(pagesDir, path)
    }

    const absoluteLayoutPaths = layoutPaths.map((path) => join(pagesDir, path))
    const absolutePagePath = resolveImportPath(pagePath)
    const absoluteErrorPath = errorPath ? (errorPath.startsWith('../') ? errorPath.replace('../', 'bunact/') : errorPath) : undefined
    const absoluteLoadingPath = loadingPath ? (loadingPath.startsWith('../') ? loadingPath.replace('../', 'bunact/') : loadingPath) : undefined

    const tempDir = join(cwd, '.bunact-temp')
    mkdirSync(tempDir, { recursive: true })

    // Transform page.tsx and save to temp file
    const pageCode = await Bun.file(absolutePagePath).text()
    const transformedPageCode = extractPageComponent(pageCode, absolutePagePath)
    const transformedPageFile = join(tempDir, `transformed-${bundleId}.tsx`)
    const tempFile = join(tempDir, `${bundleId}.tsx`)

    writeFileSync(transformedPageFile, transformedPageCode)

    const hydrateScript = createHydrateScript(absoluteLayoutPaths, transformedPageFile, absoluteErrorPath, absoluteLoadingPath)

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
                let code = await Bun.file(args.path).text()

                if (hasUseClientDirective(code)) {
                    const cleanCode = code.replace(/^["']use client["'];?\s*\n?/m, '')
                    return {
                        contents: cleanCode,
                        loader: 'tsx',
                    }
                }

                // Skip page.tsx files - they are pre-transformed and saved as separate files
                if (args.path.includes('/pages/') && !args.path.endsWith('/page.tsx') && !args.path.endsWith('/page.ts')) {
                    const cssImports: string[] = []
                    const importRegex = /import\s+['"](.*?\.css)['"]/g
                    let match

                    while ((match = importRegex.exec(code)) !== null) {
                        cssImports.push(match[0])
                    }

                    // Extract client component from async Page/Layout pattern
                    let transformed = code
                    if (args.path.endsWith('/layout.tsx') || args.path.endsWith('/layout.ts')) {
                        transformed = extractPageComponent(code, args.path)
                    } else {
                        transformed = wrapServerOnlyCode(code, args.path)
                    }
                    const finalCode = cssImports.length > 0 ? `${cssImports.join('\n')}\n${transformed}` : transformed

                    return {
                        contents: finalCode,
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

    let collectedCSS = ''

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

                collectedCSS += processedCSS + '\n'

                return {
                    contents: 'export default "";',
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
            // Phase 1: Only exclude Node.js built-in modules
            // Server-only packages are handled by wrapServerOnlyCode transform
            // which wraps server imports in conditional checks
            // React must be external to prevent multiple instances in HMR
            external: [
                'react',
                'react-dom',
                'react-dom/client',
                'react-dom/server',
                ...builtinModules,
                ...builtinModules.map(m => `node:${m}`)
            ],
            define: {
                'process.env.NODE_ENV': process.env.NODE_ENV === 'production' ? '"production"' : '"development"',
                ...(config.publicEnvVars || {}),
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

        let cssFile: string | undefined
        if (collectedCSS.trim()) {
            cssFile = `${bundleId}.css`
            const cssPath = join(outputDir, cssFile)
            writeFileSync(cssPath, collectedCSS)
        }

        bundleCache.set(bundleId, { outputDir, mainScript, cssFile })

        const manifestPath = join(outputDir, 'manifest.json')
        writeFileSync(
            manifestPath,
            JSON.stringify(
                {
                    bundleId,
                    mainScript,
                    cssFile,
                },
                null,
                2,
            ),
        )

        rmSync(tempFile, { force: true })
        rmSync(transformedPageFile, { force: true })

        return { bundleId, outputDir, mainScript, cssFile }
    } catch (error) {
        rmSync(tempFile, { force: true })
        rmSync(transformedPageFile, { force: true })
        throw error
    }
}

export const getBundleOutputDir = (bundleId: string) => {
    return bundleCache.get(bundleId)?.outputDir
}

export const getBundleManifest = (bundleId: string, rootDir: string) => {
    const cached = bundleCache.get(bundleId)
    if (cached) {
        return cached
    }

    const manifestPath = join(rootDir, '.bunact-bundles', bundleId, 'manifest.json')
    if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
        return {
            outputDir: join(rootDir, '.bunact-bundles', bundleId),
            mainScript: manifest.mainScript,
            cssFile: manifest.cssFile,
        }
    }

    return null
}

export const clearBundleCache = () => {
    bundleCache.clear()
}
