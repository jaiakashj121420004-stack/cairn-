import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { Plus, Pin, PinOff, Trash2, Eye, Pencil, FileText, ChevronDown } from 'lucide-react'
import { Button, Modal, useToast } from '../../components/ui'
import { ipc } from '../../lib/ipc'
import { cn } from '../../lib/cn'
import { formatDate } from '../../lib/formatters'
import { renderMarkdown } from '../../lib/markdown'
import { NOTEBOOK_TEMPLATES } from './templates'
import type { NotebookEntry, NotebookEntrySummary } from '@shared/types/index'

const MD_CLASSES =
  'text-body-sm text-text-secondary leading-relaxed ' +
  '[&_h1]:text-h3 [&_h1]:font-bold [&_h1]:text-text-primary [&_h1]:mt-1 [&_h1]:mb-2 ' +
  '[&_h2]:text-body [&_h2]:font-semibold [&_h2]:text-text-primary [&_h2]:mt-4 [&_h2]:mb-1.5 ' +
  '[&_h3]:font-semibold [&_h3]:text-text-primary [&_h3]:mt-3 [&_h3]:mb-1 ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5 [&_li]:my-0.5 ' +
  '[&_p]:my-2 [&_a]:text-accent-a [&_a]:underline [&_code]:font-mono [&_code]:text-accent-b ' +
  '[&_strong]:text-text-primary [&_strong]:font-semibold ' +
  '[&_blockquote]:border-l-2 [&_blockquote]:border-accent-a/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-text-muted [&_blockquote]:my-2 ' +
  '[&_hr]:border-border [&_hr]:my-3'

export function NotebookPage() {
  const toast = useToast()
  const [list, setList] = useState<NotebookEntrySummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [entry, setEntry] = useState<NotebookEntry | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [templateMenu, setTemplateMenu] = useState(false)

  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  const loadList = useCallback(async () => {
    const res = await ipc.notebook.list()
    if (res.ok) setList(res.data)
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const openEntry = useCallback(async (id: string) => {
    const res = await ipc.notebook.get(id)
    if (res.ok) {
      setEntry(res.data)
      setSelectedId(id)
      setTitle(res.data.title)
      setContent(res.data.content)
      setDirty(false)
      setMode('edit')
    }
  }, [])

  async function persist(): Promise<boolean> {
    if (!selectedId || !dirtyRef.current) return true
    setSaving(true)
    const res = await ipc.notebook.update({ id: selectedId, title: title.trim() || 'Untitled', content })
    setSaving(false)
    if (!res.ok) {
      toast('Could not save the note.', 'error')
      return false
    }
    setDirty(false)
    setEntry(res.data)
    await loadList()
    return true
  }

  async function selectEntry(id: string) {
    if (id === selectedId) return
    await persist()
    await openEntry(id)
  }

  async function createEntry(templateId: string | null) {
    setTemplateMenu(false)
    await persist()
    const tpl = templateId ? NOTEBOOK_TEMPLATES.find((t) => t.id === templateId) : undefined
    const res = await ipc.notebook.create({
      title: tpl?.title ?? 'Untitled',
      content: tpl?.content ?? '',
      template: tpl?.id ?? null,
    })
    if (!res.ok) {
      toast('Could not create the note.', 'error')
      return
    }
    await loadList()
    await openEntry(res.data.id)
  }

  async function togglePin(item: NotebookEntrySummary) {
    const res = await ipc.notebook.update({ id: item.id, pinned: item.pinned !== 1 })
    if (res.ok) await loadList()
  }

  async function doDelete() {
    if (!selectedId) return
    const res = await ipc.notebook.delete(selectedId)
    setConfirmDelete(false)
    if (!res.ok) {
      toast('Could not delete the note.', 'error')
      return
    }
    setSelectedId(null)
    setEntry(null)
    setTitle('')
    setContent('')
    setDirty(false)
    await loadList()
    toast('Note deleted.', 'success')
  }

  return (
    <div className="flex h-full">
      {/* ── List column ─────────────────────────────────────── */}
      <div className="flex w-72 shrink-0 flex-col border-r" style={{ borderColor: 'var(--glass-border)' }}>
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--glass-border)' }}>
          <h1 className="text-body font-semibold text-text-primary">Notebook</h1>
          <div className="relative">
            <div className="flex">
              <Button size="sm" onClick={() => void createEntry(null)} className="rounded-r-none">
                <Plus className="mr-1 h-3.5 w-3.5" strokeWidth={2.5} />
                New
              </Button>
              <button
                type="button"
                aria-label="New from template"
                onClick={() => setTemplateMenu((v) => !v)}
                className="flex items-center rounded-r-[8px] border border-l-0 border-accent-a/30 bg-accent-a/10 px-1.5 text-accent-a hover:bg-accent-a/20"
              >
                <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
            {templateMenu && (
              <div
                className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-[10px] border border-border bg-surface-elevated shadow-lg"
              >
                {NOTEBOOK_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void createEntry(t.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-caption text-text-secondary hover:bg-white/[0.04]"
                  >
                    <FileText className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.5} />
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <p className="px-4 py-6 text-caption text-text-muted">
              No notes yet. Start one, or pick a template.
            </p>
          ) : (
            list.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void selectEntry(item.id)}
                className={cn(
                  'group block w-full border-b px-4 py-3 text-left transition-colors hover:bg-white/[0.03]',
                  selectedId === item.id && 'bg-accent-a/[0.06]',
                )}
                style={{ borderColor: 'var(--glass-border)' }}
              >
                <div className="flex items-center gap-1.5">
                  {item.pinned === 1 && <Pin className="h-3 w-3 shrink-0 text-accent-b" strokeWidth={2} />}
                  <span className="truncate text-body-sm font-medium text-text-primary">{item.title}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={item.pinned === 1 ? 'Unpin' : 'Pin'}
                    onClick={(e) => { e.stopPropagation(); void togglePin(item) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void togglePin(item) } }}
                    className="ml-auto opacity-0 transition-opacity group-hover:opacity-100 text-text-muted hover:text-accent-b"
                  >
                    {item.pinned === 1 ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </span>
                </div>
                {item.preview && (
                  <p className="mt-0.5 truncate text-caption text-text-muted">{item.preview}</p>
                )}
                <p className="mt-0.5 text-micro text-text-muted/55">{formatDate(item.updatedAt)}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Editor column ───────────────────────────────────── */}
      <div className="flex flex-1 flex-col">
        {entry ? (
          <>
            <div className="flex items-center gap-2 border-b px-5 py-3" style={{ borderColor: 'var(--glass-border)' }}>
              <input
                value={title}
                onChange={(e) => { setTitle(e.target.value); setDirty(true) }}
                placeholder="Untitled"
                className="flex-1 bg-transparent text-body font-semibold text-text-primary placeholder:text-text-muted focus:outline-none"
              />
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMode((m) => (m === 'edit' ? 'preview' : 'edit'))}
                  className="flex items-center gap-1 rounded-[7px] border border-border px-2 py-1 text-caption text-text-secondary hover:bg-surface-elevated"
                >
                  {mode === 'edit' ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  {mode === 'edit' ? 'Preview' : 'Edit'}
                </button>
                <button
                  type="button"
                  aria-label="Delete note"
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-[7px] border border-border p-1.5 text-text-muted hover:border-danger/40 hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <Button size="sm" onClick={() => void persist()} loading={saving} disabled={!dirty}>
                  Save
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {mode === 'edit' ? (
                <textarea
                  value={content}
                  onChange={(e) => { setContent(e.target.value); setDirty(true) }}
                  onBlur={() => void persist()}
                  placeholder="Write in markdown… # heading, - bullet, **bold**, > quote"
                  className="h-full min-h-[400px] w-full resize-none bg-transparent font-mono text-body-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:outline-none"
                />
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={MD_CLASSES}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <FileText className="h-10 w-10 text-text-muted/40" strokeWidth={1} />
            <p className="mt-3 text-body-sm text-text-muted">Select a note, or start a new one.</p>
          </div>
        )}
      </div>

      {confirmDelete && (
        <Modal open onClose={() => setConfirmDelete(false)} title="Delete note?" maxWidth="380px">
          <p className="text-body-sm text-text-secondary">
            This note will be removed from your notebook. This can’t be undone here.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void doDelete()}>Delete</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
