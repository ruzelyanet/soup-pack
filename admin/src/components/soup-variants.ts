export const SOUP_VARIANTS = [
    'tom-yam',
    'chicken-noodle',
    'pumpkin-cream',
    'lentil',
    'spaghetti',
    'cola',
    'borsch',
    'kharcho',
    'minestrone',
    'mushroom-cream',
    'default',
] as const

export type SoupVariant = typeof SOUP_VARIANTS[number]

export function slugToVariant(slug?: string | null): SoupVariant {
    if (!slug) return 'default'
    return (SOUP_VARIANTS as readonly string[]).includes(slug) ? (slug as SoupVariant) : 'default'
}
