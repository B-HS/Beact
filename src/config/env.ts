export const isServer = typeof window === 'undefined'
export const isClient = typeof window !== 'undefined'

export const getPublicEnvVars = () => {
    const publicEnvVars: Record<string, string> = {}

    for (const key in process.env) {
        if (key.startsWith('BEACT_PUBLIC_')) {
            const envKey = `process.env.${key}`
            const envValue = process.env[key]
            publicEnvVars[envKey] = JSON.stringify(envValue)
        }
    }

    return publicEnvVars
}
