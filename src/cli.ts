#!/usr/bin/env bun

import { create } from './commands/create'
import { dev } from './commands/dev'
import { build } from './commands/build'

const command = process.argv[2]

switch (command) {
    case 'create':
        await create(process.argv[3])
        break
    case 'dev':
        await dev()
        break
    case 'build':
        await build()
        break
    default:
        console.log('Usage: beact <create|dev|build>')
        console.log('')
        console.log('Commands:')
        console.log('  create <app-name>  Create a new Beact app')
        console.log('  dev                Start development server')
        console.log('  build              Build for production')
        process.exit(1)
}
