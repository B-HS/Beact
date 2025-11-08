export const createHydrateScript = (layoutPaths: string[], pagePath: string, errorPath?: string, loadingPath?: string) => {
    const layoutImports = layoutPaths
        .map((path, index) => `import Layout${index} from '${path}'`)
        .join('\n')

    const errorImport = errorPath ? `import ErrorComponent from '${errorPath}'` : ''
    const errorBoundaryImport = errorPath ? `import { ErrorBoundary } from 'meact/ui/error-boundary'` : ''

    const loadingImport = loadingPath ? `import LoadingComponent from '${loadingPath}'` : ''
    const suspenseImport = loadingPath ? `import { Suspense, createElement } from 'react'` : errorPath ? `import { createElement } from 'react'` : ''

    const errorWrapper = ''

    const suspenseWrapper = ''

    return `
import { hydrateRoot } from 'react-dom/client'
import { ssrCache } from 'meact/router'
${suspenseImport}
${errorBoundaryImport}
${errorImport}
${loadingImport}
${layoutImports}
import Page from '${pagePath}'

const setPromiseCacheValue = () => {}

const createHeadersProxy = (headersRecord) => {
  if (!headersRecord) return null

  const lowerCaseHeaders = {}
  try {
    Object.entries(headersRecord).forEach(([key, value]) => {
      lowerCaseHeaders[key.toLowerCase()] = value
    })
  } catch (err) {
    console.error('Failed to create headers proxy:', err)
    return null
  }

  return {
    get: (key) => {
      try {
        return lowerCaseHeaders[key.toLowerCase()] || null
      } catch (err) {
        return null
      }
    },
    has: (key) => {
      try {
        return key.toLowerCase() in lowerCaseHeaders
      } catch (err) {
        return false
      }
    },
    entries: () => {
      try {
        return Object.entries(lowerCaseHeaders)
      } catch (err) {
        return []
      }
    },
    forEach: (callback) => {
      try {
        Object.entries(lowerCaseHeaders).forEach(([k, v]) => callback(v, k))
      } catch (err) {
        console.error('Failed to iterate headers:', err)
      }
    }
  }
}

;(async () => {
  try {
    const pageProps = window.__MEACT_PAGE_PROPS__ || {
      params: {},
      searchParams: {},
      cookies: {},
      headers: {}
    }

    if (pageProps.headers) {
      pageProps.headers = createHeadersProxy(pageProps.headers)
    }

    const cachedPageResult = ssrCache.get(Page)
    const pageResult = cachedPageResult || await Page(pageProps)
    let tree = await pageResult.default()

${layoutPaths
    .map((_, index) => `  const cachedLayout${index}Result = ssrCache.get(Layout${index})
  const layout${index}Result = cachedLayout${index}Result || await Layout${index}({ children: tree, ...pageProps${index === 0 ? ', metadata: []' : ''} })
  tree = await layout${index}Result.default()`)
    .reverse()
    .join('\n')}
${suspenseWrapper}
${errorWrapper}

    hydrateRoot(document, tree)
  } catch (err) {
    console.error('Hydration failed:', err)
  }
})()
`
}
