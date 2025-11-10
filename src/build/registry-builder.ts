import { readdirSync, statSync, readFileSync } from 'fs'
import { join, relative, extname, basename } from 'path'
import type { ComponentMetadata, RegistryBuildResult } from '../serialization/types'

/**
 * Scan directories for client components
 *
 * Recursively scans directories and identifies components marked with 'use client'
 *
 * @param dir - Directory to scan
 * @param baseDir - Base directory for relative paths
 * @returns Array of component metadata
 */
export function scanClientComponents(dir: string, baseDir?: string): ComponentMetadata[] {
    const base = baseDir || dir
    const components: ComponentMetadata[] = []

    try {
        const entries = readdirSync(dir)

        for (const entry of entries) {
            const fullPath = join(dir, entry)
            const stats = statSync(fullPath)

            if (stats.isDirectory()) {
                // Skip node_modules and hidden directories
                if (entry === 'node_modules' || entry.startsWith('.')) {
                    continue
                }

                // Recursively scan subdirectories
                const nested = scanClientComponents(fullPath, base)
                components.push(...nested)
            } else if (stats.isFile()) {
                // Only process .tsx and .jsx files
                const ext = extname(entry)
                if (ext !== '.tsx' && ext !== '.jsx' && ext !== '.ts' && ext !== '.js') {
                    continue
                }

                // Check if file contains 'use client' directive
                const isClient = hasUseClientDirective(fullPath)

                if (isClient) {
                    const metadata = extractComponentMetadata(fullPath, base)
                    if (metadata) {
                        components.push(metadata)
                    }
                }
            }
        }
    } catch (error) {
        console.error(`Error scanning directory ${dir}:`, error)
    }

    return components
}

/**
 * Check if a file has 'use client' directive
 */
function hasUseClientDirective(filePath: string): boolean {
    try {
        const content = readFileSync(filePath, 'utf-8')

        // Check for 'use client' at the beginning of the file
        // Must be before any imports or code
        const lines = content.split('\n')

        for (const line of lines) {
            const trimmed = line.trim()

            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
                continue
            }

            // Check for 'use client' directive
            if (trimmed === "'use client'" || trimmed === '"use client"') {
                return true
            }

            // If we hit any code before finding 'use client', it's not there
            if (!trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
                return false
            }
        }

        return false
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error)
        return false
    }
}

/**
 * Extract component metadata from a file
 */
function extractComponentMetadata(filePath: string, baseDir: string): ComponentMetadata | null {
    try {
        const content = readFileSync(filePath, 'utf-8')
        const relativePath = relative(baseDir, filePath)

        // Extract component name from file
        const fileName = basename(filePath, extname(filePath))

        // Try to find exported component name
        const exportedName = extractExportedComponentName(content) || fileName

        // Generate component ID
        const componentId = `c:${exportedName}`

        // Extract dependencies (simplified - just look for imports)
        const dependencies = extractDependencies(content)

        return {
            id: componentId,
            name: exportedName,
            path: relativePath,
            isClientComponent: true,
            dependencies,
        }
    } catch (error) {
        console.error(`Error extracting metadata from ${filePath}:`, error)
        return null
    }
}

/**
 * Extract the name of the main exported component
 */
function extractExportedComponentName(content: string): string | null {
    // Look for: export default function ComponentName
    const defaultFunctionMatch = content.match(/export\s+default\s+function\s+(\w+)/)
    if (defaultFunctionMatch && defaultFunctionMatch[1]) {
        return defaultFunctionMatch[1]
    }

    // Look for: export const ComponentName =
    const namedConstMatch = content.match(/export\s+const\s+(\w+)\s*=/)
    if (namedConstMatch && namedConstMatch[1]) {
        return namedConstMatch[1]
    }

    // Look for: export function ComponentName
    const namedFunctionMatch = content.match(/export\s+function\s+(\w+)/)
    if (namedFunctionMatch && namedFunctionMatch[1]) {
        return namedFunctionMatch[1]
    }

    return null
}

/**
 * Extract import dependencies from file content
 */
function extractDependencies(content: string): string[] {
    const dependencies: string[] = []

    // Match all import statements
    const importRegex = /import\s+.*?from\s+['"](.+?)['"]/g
    let match

    while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1]

        // Skip if no import path or external packages (those without ./ or ../)
        if (!importPath || !importPath.startsWith('.')) {
            continue
        }

        dependencies.push(importPath)
    }

    return dependencies
}

/**
 * Generate registry code for server and client
 *
 * @param components - Array of component metadata
 * @param baseDir - Base directory where components are located
 * @param outputDir - Directory where registry files will be written
 * @returns Generated registry code
 */
export function generateComponentRegistry(
    components: ComponentMetadata[],
    baseDir: string,
    outputDir: string
): RegistryBuildResult {
    const serverRegistry = generateServerRegistry(components, baseDir, outputDir)
    const clientRegistry = generateClientRegistry(components, baseDir, outputDir)

    return {
        serverRegistry,
        clientRegistry,
        components,
    }
}

/**
 * Generate server-side registry code
 */
function generateServerRegistry(components: ComponentMetadata[], baseDir: string, outputDir: string): string {
    const { relative } = require('path')
    const imports: string[] = []
    const entries: string[] = []

    for (const component of components) {
        // Calculate relative path from outputDir to component
        const componentFullPath = join(baseDir, component.path)
        const relativePath = relative(outputDir, componentFullPath).replace(/\.(tsx?|jsx?)$/, '')

        // Normalize path separators for imports
        const importPath = relativePath.split('\\').join('/')
        const varName = sanitizeVarName(component.name)

        imports.push(`import { default as ${varName} } from '${importPath}'`)

        // Generate registry entry
        entries.push(`[${varName}, '${component.id}']`)
    }

    return `
// Auto-generated server component registry
// DO NOT EDIT MANUALLY

${imports.join('\n')}

export const serverComponentRegistry = new Map<Function, string>([
${entries.map((e) => '    ' + e).join(',\n')}
])
`.trim()
}

/**
 * Generate client-side registry code
 */
function generateClientRegistry(components: ComponentMetadata[], baseDir: string, outputDir: string): string {
    const { relative } = require('path')
    const entries: string[] = []

    for (const component of components) {
        // Calculate relative path from outputDir to component
        const componentFullPath = join(baseDir, component.path)
        const relativePath = relative(outputDir, componentFullPath).replace(/\.(tsx?|jsx?)$/, '')

        // Normalize path separators for imports
        const importPath = relativePath.split('\\').join('/')

        // Generate registry entry with lazy loading
        entries.push(`'${component.id}': lazy(() => import('${importPath}'))`)
    }

    return `
// Auto-generated client component registry
// DO NOT EDIT MANUALLY

import { lazy } from 'react'

export const clientComponentRegistry = {
${entries.map((e) => '    ' + e).join(',\n')}
}
`.trim()
}

/**
 * Sanitize component name to be a valid JavaScript variable
 */
function sanitizeVarName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_')
}

/**
 * Build registry files and write to disk
 */
export async function buildRegistryFiles(
    pagesDir: string,
    outputDir: string
): Promise<RegistryBuildResult> {
    const { writeFile, mkdir } = await import('fs/promises')

    // Scan for client components
    const components = scanClientComponents(pagesDir)

    // Generate registry code with proper path calculation
    const result = generateComponentRegistry(components, pagesDir, outputDir)

    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true })

    // Write server registry
    const serverPath = join(outputDir, 'server-registry.ts')
    await writeFile(serverPath, result.serverRegistry, 'utf-8')

    // Write client registry
    const clientPath = join(outputDir, 'client-registry.ts')
    await writeFile(clientPath, result.clientRegistry, 'utf-8')

    console.log(`✅ Generated component registries:`)
    console.log(`   Server: ${serverPath}`)
    console.log(`   Client: ${clientPath}`)
    console.log(`   Components: ${components.length}`)

    return result
}

/**
 * Watch for file changes and rebuild registries
 */
export function watchRegistryFiles(pagesDir: string, outputDir: string, onChange: () => void): void {
    const { watch } = require('fs')

    const watcher = watch(pagesDir, { recursive: true }, async (eventType: string, filename: string) => {
        if (!filename) return

        // Only rebuild on .tsx, .jsx file changes
        const ext = extname(filename)
        if (ext !== '.tsx' && ext !== '.jsx') {
            return
        }

        console.log(`📝 Component file changed: ${filename}`)
        console.log(`🔄 Rebuilding component registries...`)

        try {
            await buildRegistryFiles(pagesDir, outputDir)
            onChange()
        } catch (error) {
            console.error('❌ Failed to rebuild registries:', error)
        }
    })

    console.log(`👀 Watching for component changes in: ${pagesDir}`)

    return watcher
}
