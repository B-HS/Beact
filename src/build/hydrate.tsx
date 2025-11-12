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

;(async () => {
  try {
    const pageProps = window.__BUNACT_PAGE_PROPS__ || {
      params: {},
      searchParams: {},
      cookies: {},
      headers: {},
      metadata: []
    }

    const pageFactory = await Page.default(pageProps)
    const PageComponent = await pageFactory.default()

    const layouts = [${layoutList}]
    let tree = PageComponent

    for (let i = layouts.length - 1; i >= 0; i--) {
      const Layout = layouts[i]
      const isRootLayout = i === 0
      const layoutProps = {
        children: tree,
        ...(isRootLayout && { metadata: pageProps.metadata })
      }
      const layoutFactory = await Layout.default(layoutProps)
      tree = await layoutFactory.default(layoutProps)
    }

    hydrateRoot(document, tree)

    console.log('✅ Hydration complete')
  } catch (err) {
    console.error('❌ Hydration failed:', err)
  }
})()
`
}
