export const createHydrateScript = (layoutPaths: string[], pagePath: string, errorPath?: string, loadingPath?: string) => {
    // NOTE: Phase 2 Architecture Change
    // We NO LONGER import page components or layouts in the client bundle
    // Instead, we deserialize the pre-rendered component tree from the server
    // This eliminates server-only dependencies (mysql2, better-auth, etc.) from client bundle

    return `
import { hydrateRoot } from 'react-dom/client'
import { deserializeComponentTree } from 'bunact/serialization/deserializer'
import { clientComponentRegistry } from 'bunact/registry/client'

// Phase 2: New hydration logic
// No page execution, no layout execution
// Just deserialize the pre-rendered tree and hydrate
;(async () => {
  try {
    // Get serialized tree from server
    const serializedTree = window.__BUNACT_TREE__

    if (!serializedTree) {
      console.error('No serialized tree found. Falling back to empty div.')
      hydrateRoot(document, document.createElement('div'))
      return
    }

    // Get page props (still needed for client components that use them)
    const pageProps = window.__BUNACT_PAGE_PROPS__ || {
      params: {},
      searchParams: {},
      cookies: {},
      headers: {}
    }

    // Deserialize the component tree
    // This reconstructs React elements from JSON without executing page/layout functions
    const tree = await deserializeComponentTree(serializedTree, {
      registry: clientComponentRegistry,
      pageProps: pageProps,
      promiseCache: window.__BUNACT_PROMISE_CACHE__
    })

    // Hydrate the pre-rendered HTML with the deserialized tree
    hydrateRoot(document, tree)

    console.log('✅ Hydration complete (Phase 2 architecture)')
  } catch (err) {
    console.error('❌ Hydration failed:', err)
    console.error('Serialized tree:', window.__BUNACT_TREE__)

    // Attempt graceful degradation
    try {
      hydrateRoot(document, document.createElement('div'))
    } catch (fallbackErr) {
      console.error('Fallback hydration also failed:', fallbackErr)
    }
  }
})()
`
}
