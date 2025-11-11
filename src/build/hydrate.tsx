export const createHydrateScript = (layoutPaths: string[], pagePath: string, errorPath?: string, loadingPath?: string) => {
    // Phase 1: Direct import of page and layouts
    // This allows all components (server and client) to work properly during hydration
    // Server-only dependencies (better-auth, mysql2) are handled via external config

    // Generate import statements for all layouts
    const layoutImports = layoutPaths
        .map((path, index) => `import Layout${index} from '${path}'`)
        .join('\n')

    // Generate nested layout JSX
    const buildLayoutTree = (depth: number, children: string): string => {
        if (depth < 0) return children
        return buildLayoutTree(depth - 1, `<Layout${depth}>{${children}}</Layout${depth}>`)
    }

    const layoutTree = layoutPaths.length > 0
        ? buildLayoutTree(layoutPaths.length - 1, '<Page {...pageProps} />')
        : '<Page {...pageProps} />'

    return `
import { hydrateRoot } from 'react-dom/client'
import Page from '${pagePath}'
${layoutImports}

;(() => {
  try {
    const pageProps = window.__BUNACT_PAGE_PROPS__ || {
      params: {},
      searchParams: {},
      cookies: {},
      headers: {}
    }

    hydrateRoot(document, ${layoutTree})

    console.log('✅ Hydration complete (Phase 1 architecture)')
  } catch (err) {
    console.error('❌ Hydration failed:', err)
  }
})()
`
}
