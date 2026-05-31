// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../../src/lib/markdown'

describe('renderMarkdown — blocks', () => {
  it('renders the three heading levels', () => {
    expect(renderMarkdown('# A')).toBe('<h1>A</h1>')
    expect(renderMarkdown('## B')).toBe('<h2>B</h2>')
    expect(renderMarkdown('### C')).toBe('<h3>C</h3>')
  })

  it('renders an unordered list', () => {
    expect(renderMarkdown('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>')
    expect(renderMarkdown('* a\n* b')).toBe('<ul><li>a</li><li>b</li></ul>')
  })

  it('renders an ordered list', () => {
    expect(renderMarkdown('1. one\n2. two')).toBe('<ol><li>one</li><li>two</li></ol>')
  })

  it('renders a blockquote with internal line breaks', () => {
    expect(renderMarkdown('> a\n> b')).toBe('<blockquote>a<br>b</blockquote>')
  })

  it('renders a horizontal rule', () => {
    expect(renderMarkdown('---')).toBe('<hr>')
  })

  it('groups consecutive lines into a paragraph with <br>', () => {
    expect(renderMarkdown('line one\nline two')).toBe('<p>line one<br>line two</p>')
  })

  it('separates paragraphs on blank lines', () => {
    expect(renderMarkdown('p1\n\np2')).toBe('<p>p1</p>\n<p>p2</p>')
  })

  it('empty input yields empty output', () => {
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown('   \n  ')).toBe('')
  })
})

describe('renderMarkdown — inline', () => {
  it('renders bold, italic and code', () => {
    expect(renderMarkdown('**b**')).toBe('<p><strong>b</strong></p>')
    expect(renderMarkdown('*i*')).toBe('<p><em>i</em></p>')
    expect(renderMarkdown('`c`')).toBe('<p><code>c</code></p>')
  })

  it('renders a safe http link with rel/target', () => {
    expect(renderMarkdown('[site](https://example.com)')).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a></p>',
    )
  })

  it('renders a mailto link', () => {
    expect(renderMarkdown('[mail](mailto:a@b.com)')).toContain('href="mailto:a@b.com"')
  })
})

describe('renderMarkdown — safety', () => {
  it('escapes raw HTML so no live tag is emitted', () => {
    const out = renderMarkdown('<script>alert(1)</script>')
    expect(out).not.toContain('<script')
    expect(out).toContain('&lt;script&gt;')
  })

  it('escapes an inline HTML injection attempt', () => {
    const out = renderMarkdown('hi <img src=x onerror=alert(1)>')
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })

  it('drops the href for a javascript: link, keeping only the text', () => {
    const out = renderMarkdown('[x](javascript:alert(1))')
    expect(out).not.toContain('href')
    expect(out).not.toContain('javascript:')
    expect(out).toContain('x')
  })

  it('never emits an unescaped double quote from user content', () => {
    const out = renderMarkdown('he said "hi"')
    expect(out).toContain('&quot;')
  })
})
