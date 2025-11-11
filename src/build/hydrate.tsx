export const createHydrateScript = (layoutPaths: string[], pagePath: string, errorPath?: string, loadingPath?: string) => {
    const layoutImports = layoutPaths
        .map((path, index) => `import Layout${index} from '${path}'`)
        .join('\n')

    const layoutList = layoutPaths
        .map((_, index) => `Layout${index}`)
        .join(', ')

    return `
import { hydrateRoot } from 'react-dom/client'
import { createElement } from 'react'
${layoutImports}
import Page from '${pagePath}'

;(() => {
  try {
    const pageProps = window.__BUNACT_PAGE_PROPS__ || {
      params: {},
      searchParams: {},
      cookies: {},
      headers: {},
      metadata: []
    }

    const layouts = [${layoutList}]
    const tree = layouts.reduceRight(
      (children, Layout, index) => {
        const isRootLayout = index === 0
        const layoutProps = isRootLayout ? { children, metadata: pageProps.metadata } : { children }
        return createElement(Layout.default || Layout, layoutProps)
      },
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
