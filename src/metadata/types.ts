interface PropertyMetadata {
    property: string
    content: string
}

interface NameMetadata {
    name: string
    content: string
}

interface TitleMetadata {
    title: string
}

interface FaviconMetadata {
    favicon: string
}

interface CanonicalMetadata {
    canonical: string
}

interface RobotsMetadata {
    robots: string
}

export type Metadata = PropertyMetadata | NameMetadata | TitleMetadata | FaviconMetadata | CanonicalMetadata | RobotsMetadata
