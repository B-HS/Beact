import { fetch } from '../server'
import { loadConfig } from '../config'
import { wrapServerOnlyCode } from '../build'
import { plugin } from 'bun'

plugin({
    name: 'meact-server-transform',
    setup(build) {
        build.onLoad({ filter: /pages\/.*\.tsx$/ }, async (args) => {
            const code = await Bun.file(args.path).text()
            const transformed = wrapServerOnlyCode(code, args.path)
            return {
                contents: transformed,
                loader: 'tsx',
            }
        })
    },
})

export const dev = async () => {
    const rootDir = process.cwd()
    const config = await loadConfig(rootDir)

    console.log(`🚀 Meact dev server starting on port ${config.port}...`)
    console.log(`📁 Project root: ${config.rootDir}`)
    console.log(`📄 Pages directory: ${config.pagesDir}`)

    Bun.serve({
        port: config.port,
        fetch: (request) => fetch(request, config),
        development: true,
    })

    console.log(`✅ Ready at http://localhost:${config.port}`)
}

if (import.meta.main) {
    dev()
}
