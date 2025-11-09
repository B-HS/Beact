import { loadConfig } from '../config'
import { mkdirSync, writeFileSync, cpSync, existsSync, rmSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { wrapServerOnlyCode } from '../build/transform'

export const build = async () => {
    const rootDir = process.cwd()
    const config = await loadConfig(rootDir)

    console.log('🔨 Building Meact standalone server...')
    console.log(`📁 Project root: ${config.rootDir}`)
    console.log(`📄 Pages directory: ${config.pagesDir}`)

    const standaloneDir = join(rootDir, '.meact')

    if (existsSync(standaloneDir)) {
        rmSync(standaloneDir, { recursive: true, force: true })
    }
    mkdirSync(standaloneDir, { recursive: true })

    console.log('📦 Bundling server...')

    const tempMeactDir = join(standaloneDir, 'node_modules/meact')
    mkdirSync(tempMeactDir, { recursive: true })
    cpSync(join(rootDir, 'node_modules/meact/dist'), join(tempMeactDir, 'dist'), { recursive: true, dereference: true })
    cpSync(join(rootDir, 'node_modules/meact/package.json'), join(tempMeactDir, 'package.json'), { dereference: true })

    const serverEntryCode = `
import { fetch } from 'meact/server'
import { loadConfig } from 'meact/config'

const rootDir = import.meta.dir
const config = await loadConfig(rootDir)

console.log('🚀 Meact server starting on port ' + config.port + '...')

Bun.serve({
    port: config.port,
    fetch: (request) => fetch(request, config),
    development: false
})

console.log('✅ Ready at http://localhost:' + config.port)
`

    const serverEntryPath = join(standaloneDir, 'server-entry.ts')
    writeFileSync(serverEntryPath, serverEntryCode)

    const result = await Bun.build({
        entrypoints: [serverEntryPath],
        outdir: standaloneDir,
        target: 'bun',
        minify: true,
        sourcemap: 'none',
        external: ['react', 'react-dom'],
    })

    if (!result.success) {
        console.error('❌ Server build failed')
        result.logs.forEach((log) => console.error(log))
        throw new Error('Build failed')
    }

    rmSync(serverEntryPath)

    console.log('📄 Copying and transforming pages...')
    const copyAndTransformPages = (srcDir: string, destDir: string) => {
        mkdirSync(destDir, { recursive: true })
        const entries = readdirSync(srcDir)

        for (const entry of entries) {
            const srcPath = join(srcDir, entry)
            const destPath = join(destDir, entry)
            const stat = statSync(srcPath)

            if (stat.isDirectory()) {
                copyAndTransformPages(srcPath, destPath)
            } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
                const code = readFileSync(srcPath, 'utf-8')
                const transformed = wrapServerOnlyCode(code, srcPath)
                writeFileSync(destPath, transformed)
            } else {
                cpSync(srcPath, destPath)
            }
        }
    }
    copyAndTransformPages(config.pagesDir, join(standaloneDir, 'pages'))

    const componentsDir = join(rootDir, 'components')
    if (existsSync(componentsDir)) {
        console.log('📦 Copying components...')
        cpSync(componentsDir, join(standaloneDir, 'components'), { recursive: true })
    }

    const publicDir = join(rootDir, 'public')
    if (existsSync(publicDir)) {
        console.log('📦 Copying public files...')
        cpSync(publicDir, join(standaloneDir, 'public'), { recursive: true })
    }

    const userConfigPath = join(rootDir, 'meact.config.ts')
    if (existsSync(userConfigPath)) {
        cpSync(userConfigPath, join(standaloneDir, 'meact.config.ts'))
    }

    console.log('📦 Copying dependencies...')
    const packageJsonPath = join(rootDir, 'package.json')
    if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
        const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies }

        for (const dep of Object.keys(dependencies)) {
            const depPath = join(rootDir, 'node_modules', dep)
            if (existsSync(depPath)) {
                console.log(`  - ${dep}`)
                try {
                    cpSync(depPath, join(standaloneDir, 'node_modules', dep), {
                        recursive: true,
                        verbatimSymlinks: true,
                        force: true,
                    })
                } catch (err) {
                    console.warn(`  ⚠️  Failed to copy ${dep}: ${err instanceof Error ? err.message : String(err)}`)
                }
            }
        }
    }

    const packageJson = {
        name: 'meact-standalone',
        type: 'module',
        scripts: {
            start: 'NODE_ENV=production bun server-entry.js',
        },
    }
    writeFileSync(join(standaloneDir, 'package.json'), JSON.stringify(packageJson, null, 2))

    console.log(`\n✨ Build complete! Output: ${standaloneDir}`)
    console.log(`\nTo run:`)
    console.log(`  cd ${standaloneDir}`)
    console.log(`  bun start`)
}

if (import.meta.main) {
    build()
}
