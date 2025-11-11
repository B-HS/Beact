export const createHydrateScript = (layoutPaths: string[], pagePath: string, errorPath?: string, loadingPath?: string) => {
    // Phase 1: Direct import of page and layouts
    // This allows all components (server and client) to work properly during hydration
    // Server-only dependencies (better-auth, mysql2) are handled via wrapServerOnlyCode transform

    // Generate import statements for all layouts
    const layoutImports = layoutPaths
        .map((path, index) => `import Layout${index} from '${path}'`)
        .join('\n')

    // Generate layout array for runtime nesting
    const layoutList = layoutPaths
        .map((_, index) => `Layout${index}`)
        .join(', ')

    return `
import { hydrateRoot } from 'react-dom/client'
import { createElement } from 'react'
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

    // Dynamically nest layouts using reduceRight with createElement
    const layouts = [${layoutList}]
    const tree = layouts.reduceRight(
      (children, Layout) => createElement(Layout, null, children),
      createElement(Page, pageProps)
    )

    hydrateRoot(document, tree)

    console.log('✅ Hydration complete (Phase 1 architecture)')
  } catch (err) {
    console.error('❌ Hydration failed:', err)
  }
})()
`
}
