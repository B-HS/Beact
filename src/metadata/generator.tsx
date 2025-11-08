import type { Metadata } from './types'

const makeKey = (m: Metadata) => {
    if ('property' in m) return `meta:property:${m.property}:${m.content}`
    if ('name' in m) return `meta:name:${m.name}:${m.content}`
    if ('title' in m) return `title:${m.title}`
    if ('favicon' in m) return `favicon:${m.favicon}`
    if ('canonical' in m) return `canonical:${m.canonical}`
    if ('robots' in m) return `robots:${m.robots}`
    return 'unknown'
}

export const generateMetatag = (data: Metadata[]) => {
    const seen = new Set<string>()

    return data
        .map((meta) => {
            const key = makeKey(meta)
            if (seen.has(key)) return null
            seen.add(key)

            if ('property' in meta) return <meta key={key} property={meta.property} content={meta.content} />
            if ('name' in meta) return <meta key={key} name={meta.name} content={meta.content} />
            if ('title' in meta) return <title key={key}>{meta.title}</title>
            if ('favicon' in meta) return <link key={key} rel='icon' href={meta.favicon} />
            if ('canonical' in meta) return <link key={key} rel='canonical' href={meta.canonical} />
            if ('robots' in meta) return <meta key={key} name='robots' content={meta.robots} />
            return null
        })
        .filter(Boolean)
}
