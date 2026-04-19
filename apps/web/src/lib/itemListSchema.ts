/**
 * Helpers for building Schema.org ItemList JSON-LD for listing pages.
 * Only emit on the canonical indexable version of a list (page=1, no filters),
 * otherwise we're just feeding crawlers structured duplicates.
 */

export interface ItemListEntry {
  url: string
  name: string
  image?: string | null
}

interface BuildItemListParams {
  origin: string
  items: ItemListEntry[]
  name?: string
  description?: string
}

function absolutize(origin: string, pathOrUrl: string): string {
  return pathOrUrl.startsWith('http') ? pathOrUrl : `${origin}${pathOrUrl}`
}

export function buildItemListSchema({ origin, items, name, description }: BuildItemListParams) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: absolutize(origin, it.url),
      name: it.name,
      ...(it.image ? { image: absolutize(origin, it.image) } : {}),
    })),
  }
}
