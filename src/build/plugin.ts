import { plugin } from 'bun'
import { wrapServerOnlyCode } from './transform'

plugin({
    name: 'beact-server-transform',
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
