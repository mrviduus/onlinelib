// TreeWalker-backed text iteration with per-match Range construction.
// Port of https://github.com/johnfactotum/foliate-js/blob/master/text-walker.js
// (MIT, © John Factotum). Adapted to TS.
//
// Use: pass a Range (to walk the portion it covers) or an Element/Document
// (to walk everything). `func(strings, makeRange)` is a generator that yields
// matches — strings is the array of text-node contents in document order,
// makeRange(startIdx, startOffset, endIdx, endOffset) constructs a Range
// across potentially multiple nodes.
//
// Replaces the per-feature ad-hoc TreeWalker loops in vocabHighlightEngine,
// in-book search, TTS sentence chunking.

type TextFinder<T> = (strings: string[], makeRange: MakeRange) => IterableIterator<T>

export type MakeRange = (
  startIndex: number,
  startOffset: number,
  endIndex: number,
  endOffset: number,
) => Range

const NODE_FILTER_MASK =
  NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_CDATA_SECTION

const defaultAcceptNode = (node: Node): number => {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const name = (node as Element).tagName.toLowerCase()
    if (name === 'script' || name === 'style' || name === 'noscript') {
      return NodeFilter.FILTER_REJECT
    }
    return NodeFilter.FILTER_SKIP
  }
  return NodeFilter.FILTER_ACCEPT
}

const walkRange = (range: Range, walker: TreeWalker): Node[] => {
  const nodes: Node[] = []
  for (let node: Node | null = walker.currentNode; node; node = walker.nextNode()) {
    const compare = range.comparePoint(node, 0)
    if (compare === 0) nodes.push(node)
    else if (compare > 0) break
  }
  return nodes
}

const walkRoot = (_: Node, walker: TreeWalker): Node[] => {
  const nodes: Node[] = []
  for (let node: Node | null = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node)
  }
  return nodes
}

function resolveRoot(input: Range | Element | Document): Node {
  if (input instanceof Range) return input.commonAncestorContainer
  if ((input as Document).body) return (input as Document).body
  return input
}

export function* textWalker<T>(
  input: Range | Element | Document,
  func: TextFinder<T>,
  filterFn: (node: Node) => number = defaultAcceptNode,
): Generator<T> {
  const root = resolveRoot(input)
  const doc = root.ownerDocument ?? (root as Document)
  const walker = doc.createTreeWalker(root, NODE_FILTER_MASK, {
    acceptNode: filterFn,
  })
  const nodes =
    input instanceof Range ? walkRange(input, walker) : walkRoot(root, walker)
  const strs = nodes.map((node) => node.nodeValue ?? '')
  const makeRange: MakeRange = (startIndex, startOffset, endIndex, endOffset) => {
    const range = doc.createRange()
    range.setStart(nodes[startIndex], startOffset)
    range.setEnd(nodes[endIndex], endOffset)
    return range
  }
  for (const match of func(strs, makeRange)) yield match
}

// Helper: find all (case-insensitive) occurrences of `needle` — emits Ranges.
// Consumer drives it for in-book search etc.
export function* findTextMatches(
  input: Range | Element | Document,
  needle: string,
): Generator<Range> {
  if (!needle) return
  const lower = needle.toLowerCase()
  yield* textWalker<Range>(input, function* (strings, makeRange) {
    for (let i = 0; i < strings.length; i++) {
      const hay = strings[i].toLowerCase()
      let from = 0
      while (from < hay.length) {
        const idx = hay.indexOf(lower, from)
        if (idx === -1) break
        yield makeRange(i, idx, i, idx + needle.length)
        from = idx + Math.max(1, needle.length)
      }
    }
  })
}
