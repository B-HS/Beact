interface CachedPage {
    html: string
    timestamp: number
    revalidateAfter: number | false
}

type CacheResult = { type: 'fresh'; html: string } | { type: 'stale'; html: string } | { type: 'miss' }

class ISRCache {
    private cache = new Map<string, CachedPage>()
    private revalidating = new Set<string>()
    private maxSize: number

    constructor(maxSize: number = 1000) {
        this.maxSize = maxSize
    }

    get(key: string): CacheResult {
        const entry = this.cache.get(key)

        if (!entry) {
            return { type: 'miss' }
        }

        if (entry.revalidateAfter === false) {
            return { type: 'fresh', html: entry.html }
        }

        const age = Date.now() - entry.timestamp

        if (age < entry.revalidateAfter * 1000) {
            return { type: 'fresh', html: entry.html }
        }

        return { type: 'stale', html: entry.html }
    }

    set(key: string, html: string, revalidate: number | false) {
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            const firstKey = this.cache.keys().next().value
            if (firstKey) {
                this.cache.delete(firstKey)
            }
        }

        this.cache.set(key, {
            html,
            timestamp: Date.now(),
            revalidateAfter: revalidate,
        })
    }

    invalidate(key: string) {
        this.cache.delete(key)
    }

    startRevalidation(key: string, renderFn: () => Promise<string>) {
        if (this.revalidating.has(key)) {
            return
        }

        this.revalidating.add(key)

        renderFn()
            .then((html) => {
                const existingEntry = this.cache.get(key)
                if (existingEntry) {
                    this.set(key, html, existingEntry.revalidateAfter)
                }
            })
            .catch((error) => {
                console.error(`[ISR] Revalidation failed for ${key}:`, error)
            })
            .finally(() => {
                this.revalidating.delete(key)
            })
    }
}

export const isrCache = new ISRCache(parseInt(process.env.BUNACT_ISR_MAX_CACHE_SIZE || '1000', 10))
