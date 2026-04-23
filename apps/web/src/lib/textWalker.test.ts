import { describe, it, expect, beforeEach } from 'vitest'
import { textWalker, findTextMatches } from './textWalker'

describe('textWalker', () => {
  let root: HTMLElement

  beforeEach(() => {
    root = document.createElement('div')
    document.body.appendChild(root)
  })

  it('walks text nodes in a simple element', () => {
    root.innerHTML = '<p>Hello <strong>world</strong> end.</p>'
    const seen: string[] = []
    const gen = textWalker<string>(root, function* (strings) {
      for (const s of strings) yield s
    })
    for (const s of gen) seen.push(s)
    expect(seen).toEqual(['Hello ', 'world', ' end.'])
  })

  it('skips script and style contents', () => {
    root.innerHTML = '<p>a</p><script>BAD</script><style>X</style><p>b</p>'
    const seen: string[] = []
    const gen = textWalker<string>(root, function* (strings) {
      for (const s of strings) yield s
    })
    for (const s of gen) seen.push(s)
    expect(seen).toEqual(['a', 'b'])
  })

  it('accepts a Range and limits to its span', () => {
    root.innerHTML = '<p>one</p><p>two</p><p>three</p>'
    const ps = root.querySelectorAll('p')
    const range = document.createRange()
    range.setStart(ps[0].firstChild!, 0)
    range.setEnd(ps[1].firstChild!, 3)
    const seen: string[] = []
    const gen = textWalker<string>(range, function* (strings) {
      for (const s of strings) yield s
    })
    for (const s of gen) seen.push(s)
    expect(seen).toContain('one')
    expect(seen).toContain('two')
    expect(seen).not.toContain('three')
  })

  it('makeRange constructs a multi-node range', () => {
    root.innerHTML = '<p>Hello <strong>bold</strong> world</p>'
    const ranges: Range[] = []
    const gen = textWalker<Range>(root, function* (strings, makeRange) {
      // span from node[0] start → node[2] end
      yield makeRange(0, 0, strings.length - 1, strings[strings.length - 1].length)
    })
    for (const r of gen) ranges.push(r)
    expect(ranges).toHaveLength(1)
    expect(ranges[0].toString()).toBe('Hello bold world')
  })

  it('custom filterFn can reject specific elements', () => {
    root.innerHTML = '<p>keep</p><aside>drop</aside><p>keep2</p>'
    const filter = (node: Node): number => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = (node as Element).tagName.toLowerCase()
        if (tag === 'aside') return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_SKIP
      }
      return NodeFilter.FILTER_ACCEPT
    }
    const seen: string[] = []
    const gen = textWalker<string>(root, function* (strings) {
      for (const s of strings) yield s
    }, filter)
    for (const s of gen) seen.push(s)
    expect(seen).toEqual(['keep', 'keep2'])
  })
})

describe('findTextMatches', () => {
  let root: HTMLElement

  beforeEach(() => {
    root = document.createElement('div')
    document.body.appendChild(root)
  })

  it('emits a range per occurrence, case-insensitive', () => {
    root.innerHTML = '<p>The cat sat. The CAT ran.</p>'
    const hits = Array.from(findTextMatches(root, 'cat'))
    expect(hits).toHaveLength(2)
    expect(hits[0].toString().toLowerCase()).toBe('cat')
  })

  it('returns nothing for empty needle', () => {
    root.textContent = 'anything'
    expect(Array.from(findTextMatches(root, ''))).toEqual([])
  })

  it('returns nothing when no match', () => {
    root.textContent = 'nothing here'
    expect(Array.from(findTextMatches(root, 'absent'))).toEqual([])
  })
})
