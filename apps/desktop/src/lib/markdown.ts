/**
 * Minimal, dependency-free markdown renderer for the Notebook.
 *
 * Local-first and XSS-safe: block structure is detected on the raw line, but all
 * text *content* is HTML-escaped before any tag is emitted, so no user text can
 * ever produce a live tag. Only a known, closed set of elements is generated.
 * Links are restricted to http/https/mailto.
 *
 * Supported: # ## ### headings, --- horizontal rules, > blockquotes, - / *
 * bullet lists, 1. ordered lists, **bold**, *italic*, `code`, [text](url),
 * paragraphs with single-newline line breaks.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escape a raw text fragment, then apply inline formatting. */
function fmt(raw: string): string {
  let out = escapeHtml(raw)
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
    // url is already escaped; only allow safe protocols.
    return /^(https?:\/\/|mailto:)/i.test(url)
      ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
      : text
  })
  return out
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let para: string[] = []

  const flushPara = (): void => {
    if (para.length > 0) {
      html.push(`<p>${para.map(fmt).join('<br>')}</p>`)
      para = []
    }
  }

  let i = 0
  while (i < lines.length) {
    const raw = (lines[i] ?? '').trim()

    if (raw === '') {
      flushPara()
      i++
      continue
    }

    if (/^---+$/.test(raw)) {
      flushPara()
      html.push('<hr>')
      i++
      continue
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(raw)
    if (heading) {
      flushPara()
      const level = heading[1]?.length ?? 1
      html.push(`<h${level}>${fmt(heading[2] ?? '')}</h${level}>`)
      i++
      continue
    }

    if (/^>\s?/.test(raw)) {
      flushPara()
      const items: string[] = []
      while (i < lines.length && /^>\s?/.test((lines[i] ?? '').trim())) {
        items.push(fmt((lines[i] ?? '').trim().replace(/^>\s?/, '')))
        i++
      }
      html.push(`<blockquote>${items.join('<br>')}</blockquote>`)
      continue
    }

    if (/^[-*]\s+/.test(raw)) {
      flushPara()
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test((lines[i] ?? '').trim())) {
        items.push(`<li>${fmt((lines[i] ?? '').trim().replace(/^[-*]\s+/, ''))}</li>`)
        i++
      }
      html.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    if (/^\d+\.\s+/.test(raw)) {
      flushPara()
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test((lines[i] ?? '').trim())) {
        items.push(`<li>${fmt((lines[i] ?? '').trim().replace(/^\d+\.\s+/, ''))}</li>`)
        i++
      }
      html.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    para.push(raw)
    i++
  }
  flushPara()

  return html.join('\n')
}
