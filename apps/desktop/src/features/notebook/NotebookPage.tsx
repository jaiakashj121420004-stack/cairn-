import '@uiw/react-md-editor/markdown-editor.css'
import MDEditor from '@uiw/react-md-editor'
import { motion } from 'framer-motion'
import { Plus, Pin, PinOff, Trash2, FileText, ChevronDown, Search, X } from 'lucide-react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { NotebookEntry, NotebookEntrySummary } from '@shared/types/index'
import { Button, Modal, useToast } from '../../components/ui'
import { cn } from '../../lib/cn'
import { formatDate } from '../../lib/formatters'
import { ipc } from '../../lib/ipc'
import { useUiStore } from '../../stores/ui-store'
import { NOTEBOOK_TEMPLATES } from './templates'

export function NotebookPage() {
  const toast = useToast()
  const resolvedTheme = useUiStore((s) => s.resolvedTheme)
  const [searchParams, setSearchParams] = useSearchParams()

  const [list, setList] = useState<NotebookEntrySummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [entry, setEntry] = useState<NotebookEntry | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState<string>('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [templateMenu, setTemplateMenu] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NotebookEntrySummary[] | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const contentRef = useRef<string>(content)
  contentRef.current = content
  const titleRef = useRef(title)
  titleRef.current = title
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId

  const loadList = useCallback(async () => {
    const res = await ipc.notebook.list()
    if (res.ok) setList(res.data)
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  // Handle ?new and ?search URL params from command palette
  useEffect(() => {
    const action = searchParams.get('action')
    if (action === 'new') {
      setSearchParams({}, { replace: true })
      void createEntry(null)
    } else if (action === 'search') {
      setSearchParams({}, { replace: true })
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openEntry = useCallback(async (id: string) => {
    const res = await ipc.notebook.get(id)
    if (res.ok) {
      setEntry(res.data)
      setSelectedId(id)
      setTitle(res.data.title)
      setContent(res.data.content)
      setDirty(false)
    }
  }, [])

  async function persist(): Promise<boolean> {
    const id = selectedIdRef.current
    if (!id || !dirtyRef.current) return true
    setSaving(true)
    const res = await ipc.notebook.update({
      id,
      title: titleRef.current.trim() || 'Untitled',
      content: contentRef.current ?? '',
    })
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

  async function handleSearch(q: string) {
    setSearchQuery(q)
    if (!q.trim()) {
      setSearchResults(null)
      return
    }
    const res = await ipc.notebook.search({ query: q.trim() })
    if (res.ok) setSearchResults(res.data)
  }

  function clearSearch() {
    setSearchQuery('')
    setSearchResults(null)
    searchInputRef.current?.focus()
  }

  // Cmd+S / Ctrl+S to save
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void persist()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  const displayList = searchResults ?? list

  return (
    <div className="flex h-full" data-color-mode={resolvedTheme}>
      {/* ── List column ─────────────────────────────────────── */}
      <div
        className="flex w-72 shrink-0 flex-col border-r"
        style={{ borderColor: 'var(--glass-border)' }}
      >
        {/* Header row */}
        <div
          className="flex items-center justify-between gap-2 border-b px-4 py-3"
          style={{ borderColor: 'var(--glass-border)' }}
        >
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
              <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-[10px] border border-border bg-surface-elevated shadow-lg">
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

        {/* Search bar */}
        <div className="border-b px-3 py-2" style={{ borderColor: 'var(--glass-border)' }}>
          <div className="flex items-center gap-1.5 rounded-[8px] border border-border bg-surface px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.5} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => void handleSearch(e.target.value)}
              placeholder="Search notes…"
              className="flex-1 bg-transparent text-caption text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={clearSearch}
                className="text-text-muted hover:text-text-secondary"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Entry list */}
        <div className="flex-1 overflow-y-auto">
          {displayList.length === 0 ? (
            <p className="px-4 py-6 text-caption text-text-muted">
              {searchQuery
                ? 'No notes match your search.'
                : 'No notes yet. Start one, or pick a template.'}
            </p>
          ) : (
            displayList.map((item) => (
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
                  {item.pinned === 1 && (
                    <Pin className="h-3 w-3 shrink-0 text-accent-b" strokeWidth={2} />
                  )}
                  <span className="truncate text-body-sm font-medium text-text-primary">
                    {item.title}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={item.pinned === 1 ? 'Unpin' : 'Pin'}
                    onClick={(e) => {
                      e.stopPropagation()
                      void togglePin(item)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation()
                        void togglePin(item)
                      }
                    }}
                    className="ml-auto opacity-0 transition-opacity group-hover:opacity-100 text-text-muted hover:text-accent-b"
                  >
                    {item.pinned === 1 ? (
                      <PinOff className="h-3.5 w-3.5" />
                    ) : (
                      <Pin className="h-3.5 w-3.5" />
                    )}
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
      <div className="flex flex-1 flex-col min-w-0">
        {entry ? (
          <>
            <div
              className="flex items-center gap-2 border-b px-5 py-3"
              style={{ borderColor: 'var(--glass-border)' }}
            >
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  setDirty(true)
                }}
                onBlur={() => void persist()}
                placeholder="Untitled"
                className="flex-1 bg-transparent text-body font-semibold text-text-primary placeholder:text-text-muted focus:outline-none"
              />
              <div className="flex shrink-0 items-center gap-1">
                {saving && <span className="text-caption text-text-muted">Saving…</span>}
                <button
                  type="button"
                  aria-label="Delete note"
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-[7px] border border-border p-1.5 text-text-muted hover:border-danger/40 hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <motion.div
              key={entry.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 overflow-hidden [&_.w-md-editor]:h-full [&_.w-md-editor]:!bg-transparent [&_.w-md-editor]:!border-0 [&_.w-md-editor-toolbar]:!border-b [&_.w-md-editor-toolbar]:!bg-transparent [&_.w-md-editor-text]:!font-mono"
            >
              <MDEditor
                value={content}
                onChange={(v) => {
                  setContent(v ?? '')
                  setDirty(true)
                }}
                onBlur={() => void persist()}
                height="100%"
                preview="live"
                visibleDragbar={false}
                hideToolbar={false}
                data-color-mode={resolvedTheme}
              />
            </motion.div>
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
            This note will be removed from your notebook. This cannot be undone here.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void doDelete()}>
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
