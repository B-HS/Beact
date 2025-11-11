export const createHydrateScript = (layoutPaths: string[], pageCode: string, errorPath?: string, loadingPath?: string) => {
    const layoutImports = layoutPaths
        .map((path, index) => `import Layout${index} from '${path}'`)
        .join('\n')

    const layoutList = layoutPaths
        .map((_, index) => `Layout${index}`)
        .join(', ')

    const pageCodeWithoutExport = pageCode.replace(/export\s+default\s+/, 'const Page = ')

    return `
import { hydrateRoot } from 'react-dom/client'
import { createElement } from 'react'
${layoutImports}

${pageCodeWithoutExport}

;(() => {
  try {
    const pageProps = window.__BUNACT_PAGE_PROPS__ || {
      params: {},
      searchParams: {},
      cookies: {},
      headers: {}
    }

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
