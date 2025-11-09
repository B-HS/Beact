import { createHydrateScript } from './hydrate'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { wrapServerOnlyCode, hasUseClientDirective } from './transform'
import { getPublicEnvVars } from '../config/env'
import type { BunPlugin } from 'bun'

const bundleCache = new Map<string, { outputDir: string; mainScript: string }>()

const generateBundleId = (pathname: string) => {
    return createHash('md5').update(pathname).digest('hex')
}

export const createClientBundle = async (
    layoutPaths: string[],
    pagePath: string,
    rootDir: string,
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

    const cwd = rootDir
    const pagesDir = join(cwd, 'pages')

    const resolveImportPath = (path: string) => {
        if (path.startsWith('../')) {
            return path.replace('../', 'meact/')
        }
        return join(pagesDir, path)
    }

    const absoluteLayoutPaths = layoutPaths.map((path) => join(pagesDir, path))
    const absolutePagePath = resolveImportPath(pagePath)
    const absoluteErrorPath = errorPath ? (errorPath.startsWith('../') ? errorPath.replace('../', 'meact/') : errorPath) : undefined
    const absoluteLoadingPath = loadingPath ? (loadingPath.startsWith('../') ? loadingPath.replace('../', 'meact/') : loadingPath) : undefined

    const hydrateScript = createHydrateScript(absoluteLayoutPaths, absolutePagePath, absoluteErrorPath, absoluteLoadingPath)

    const tempDir = join(cwd, '.meact-temp')
    mkdirSync(tempDir, { recursive: true })
    const tempFile = join(tempDir, `${bundleId}.tsx`)

    writeFileSync(tempFile, hydrateScript)

    const serverOnlyPlugin: BunPlugin = {
        name: 'server-only-transform',
        setup(build) {
            build.onResolve({ filter: /^meact\/ui\// }, (args) => {
                const uiPath = args.path.replace('meact/ui/', '')
                return {
                    path: join(cwd, 'node_modules', 'meact', 'dist', 'ui', uiPath + '.js'),
                }
            })

            build.onResolve({ filter: /^meact\/router$/ }, () => {
                return {
                    path: join(cwd, 'node_modules', 'meact', 'dist', 'router', 'index.js'),
                }
            })

            build.onResolve({ filter: /^meact\/context\/promise$/ }, () => {
                return {
                    path: join(cwd, 'node_modules', 'meact', 'dist', 'context', 'promise.js'),
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

    try {
        const outputDir = join(cwd, '.meact-bundles', bundleId)
        mkdirSync(outputDir, { recursive: true })

        const result = await Bun.build({
            entrypoints: [tempFile],
            target: 'browser',
            format: 'esm',
            minify: true,
            splitting: true,
            outdir: outputDir,
            naming: '[name]-[hash].[ext]',
            plugins: [serverOnlyPlugin],
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
