import { AsyncLocalStorage } from 'async_hooks'

export const promiseStorage = new AsyncLocalStorage<Map<string, any>>()

export const getPromiseCache = (): Map<string, any> => {
    return promiseStorage.getStore() || new Map()
}

export const setPromiseCacheValue = (key: string, value: any): void => {
    const cache = promiseStorage.getStore()
    if (cache) {
        cache.set(key, value)
    }
}

export const getPromiseCacheValue = (key: string): any => {
    const cache = promiseStorage.getStore()
    return cache?.get(key)
}
