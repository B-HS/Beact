import { createHydrateScript } from './hydrate'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { wrapServerOnlyCode } from './transform'
import { getPublicEnvVars } from '../config/env'
import type { BunPlugin } from 'bun'

const bundleCache = new Map<string, string>()

const generateBundleId = (pathname: string) => {
    return createHash('md5').update(pathname).digest('hex')
}

export const createClientBundle = async (layoutPaths: string[], pagePath: string, rootDir: string, errorPath?: string, pathname?: string, loadingPath?: string) => {
    if (!pathname) {
        pathname = pagePath
    }
    const bundleId = generateBundleId(pathname)

    if (bundleCache.has(bundleId)) {
        return { bundleId, bundleCode: bundleCache.get(bundleId)! }
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

            build.onLoad({ filter: /pages\/.*\.tsx$/ }, async (args) => {
                const code = await Bun.file(args.path).text()
                const transformed = wrapServerOnlyCode(code, args.path)
                return {
                    contents: transformed,
                    loader: 'tsx',
                }
            })
        },
    }

    try {
        const result = await Bun.build({
            entrypoints: [tempFile],
            target: 'browser',
            format: 'esm',
            minify: true,
            plugins: [serverOnlyPlugin],
            define: {
                'process.env.NODE_ENV': '"production"',
                ...getPublicEnvVars(),
            },
        })

        if (!result.success) {
            throw new Error('Bundle failed')
        }

        const output = result.outputs[0]
        if (!output) {
            throw new Error('No bundle output generated')
        }

        const bundleCode = await output.text()
        bundleCache.set(bundleId, bundleCode)

        rmSync(tempDir, { recursive: true, force: true })

        return { bundleId, bundleCode }
    } catch (error) {
        rmSync(tempDir, { recursive: true, force: true })
        throw error
    }
}

export const getBundleFromCache = (bundleId: string) => {
    return bundleCache.get(bundleId)
}
