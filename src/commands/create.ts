import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'

export const create = async (projectName?: string) => {
    if (!projectName) {
        console.error('Error: Project name is required')
        console.log('Usage: meact create <project-name>')
        process.exit(1)
    }

    const projectPath = join(process.cwd(), projectName)

    console.log(`\n🚀 Creating Meact project: ${projectName}\n`)

    try {
        await mkdir(projectPath, { recursive: true })

        await mkdir(join(projectPath, 'pages'), { recursive: true })
        await mkdir(join(projectPath, 'public'), { recursive: true })
        await mkdir(join(projectPath, 'components'), { recursive: true })

        await writeFile(
            join(projectPath, 'package.json'),
            JSON.stringify(
                {
                    name: projectName,
                    version: '1.0.0',
                    type: 'module',
                    scripts: {
                        dev: 'bun --watch node_modules/@meact/meact/dist/commands/dev.js',
                    },
                    dependencies: {
                        '@meact/core': 'workspace:*',
                        'react': '^19',
                        'react-dom': '^19',
                    },
                    devDependencies: {
                        '@types/react': '^19',
                        '@types/react-dom': '^19',
                        'typescript': '^5',
                    },
                },
                null,
                2,
            ),
        )

        await writeFile(
            join(projectPath, 'tsconfig.json'),
            JSON.stringify(
                {
                    extends: 'feconfig-bhs/tsconfig.json',
                    compilerOptions: {
                        jsx: 'react',
                        jsxImportSource: 'react',
                        lib: ['ES2023', 'DOM', 'DOM.Iterable'],
                        target: 'ES2022',
                        module: 'ESNext',
                        moduleResolution: 'bundler',
                        resolveJsonModule: true,
                        allowJs: true,
                        strict: true,
                        skipLibCheck: true,
                        noEmit: true,
                        paths: {
                            '@/*': ['./*'],
                        },
                    },
                    include: ['**/*.ts', '**/*.tsx'],
                    exclude: ['node_modules'],
                },
                null,
                2,
            ),
        )

        await writeFile(
            join(projectPath, '.env.example'),
            `# 서버 전용 환경 변수 (클라이언트에 노출되지 않음)
SECRET_KEY=your-secret-key-here

# 클라이언트 환경 변수 (브라우저에서 접근 가능)
# MEACT_PUBLIC_ 접두사가 있는 변수만 클라이언트 번들에 포함됨
MEACT_PUBLIC_API_URL=https://api.example.com
MEACT_PUBLIC_APP_NAME=Meact Framework
`,
        )

        await writeFile(
            join(projectPath, '.gitignore'),
            `node_modules
.meact
.env
dist
*.log
`,
        )

        await writeFile(
            join(projectPath, 'pages', 'layout.tsx'),
            `import type { ReactNode } from 'react'
import type { Metadata } from '../types'
import { generateMetatag } from '../metadata'

interface LayoutProps {
    children: ReactNode
    metadata?: Metadata[]
}

const Layout = async ({ children, metadata = [] }: LayoutProps) => {
    return {
        default: () => {
            const metaTags = generateMetatag(metadata)

            return (
                <html lang='en'>
                    <head>
                        <meta charSet='UTF-8' />
                        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
                        {metaTags}
                    </head>
                    <body>{children}</body>
                </html>
            )
        },
    }
}

export default Layout
`,
        )

        await writeFile(
            join(projectPath, 'pages', 'page.tsx'),
            `import type { Metadata, PageProps } from '../types'

const Home = async ({ params, searchParams }: PageProps) => {
    const metadata: Metadata[] = [
        { title: 'Welcome to Meact' },
        { name: 'description', content: 'A modern React framework built with Bun' },
    ]

    return {
        metadata,
        default: () => (
            <div>
                <h1>Welcome to Meact</h1>
                <p>Edit pages/page.tsx to get started!</p>
            </div>
        ),
    }
}

export default Home
`,
        )

        await writeFile(join(projectPath, 'public', '.gitkeep'), '')

        await writeFile(
            join(projectPath, 'README.md'),
            `# ${projectName}

A Meact project.

## Getting Started

1. Install dependencies:
\`\`\`bash
bun install
\`\`\`

2. Run the development server:
\`\`\`bash
bun run dev
\`\`\`

3. Open [http://localhost:3000](http://localhost:3000) with your browser.

## Learn More

- [Meact Documentation](https://github.com/your-org/meact)
- [React Documentation](https://react.dev)
`,
        )

        console.log('✅ Project created successfully!\n')
        console.log('Next steps:')
        console.log(`  cd ${projectName}`)
        console.log('  bun install')
        console.log('  bun run dev\n')
    } catch (error) {
        console.error('Error creating project:', error)
        process.exit(1)
    }
}
