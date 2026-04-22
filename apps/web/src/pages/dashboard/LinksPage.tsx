import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { linksApi, type Link, type CreateLinkPayload } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Copy, ExternalLink, BarChart2, Pencil, Trash2, Plus, Search } from 'lucide-react'
import { buildShortUrl, copyToClipboard, expiryLabel, isExpired, formatDate } from '@/lib/utils'

export default function LinksPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [editLink, setEditLink] = useState<Link | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['links', page, search],
    queryFn: () => linksApi.list({ page, limit: 20, search: search || undefined }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => linksApi.delete(id),
    onSuccess: () => {
      toast.success('Link deleted')
      queryClient.invalidateQueries({ queryKey: ['links'] })
      setDeleteId(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">My Links</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Create Link
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search links..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="pl-9"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : !data?.links.length ? (
        <div className="text-center py-12 text-muted-foreground">
          No links yet. Create your first one!
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium w-12">#</th>
                <th className="px-4 py-3 text-left font-medium">Short Link</th>
                <th className="px-4 py-3 text-left font-medium">Destination</th>
                <th className="px-4 py-3 text-left font-medium">Expiry</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.links.map((link) => (
                <tr key={link.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 text-muted-foreground text-xs">{link.user_seq}</td>
                  <td className="px-4 py-3 font-mono">
                    <div className="flex items-center gap-1">
                      <span className="text-primary">{link.slug}</span>
                      <button
                        onClick={() =>
                          copyToClipboard(buildShortUrl(link.slug)).then(() =>
                            toast.success('Copied!'),
                          )
                        }
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <div className="flex items-center gap-1 truncate">
                      <span className="truncate text-muted-foreground">{link.destination_url}</span>
                      <a
                        href={link.destination_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{expiryLabel(link.expires_at)}</td>
                  <td className="px-4 py-3">
                    {!link.is_active ? (
                      <Badge variant="secondary">Inactive</Badge>
                    ) : isExpired(link.expires_at) ? (
                      <Badge variant="destructive">Expired</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(link.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(`/dashboard/analytics?linkId=${link.id}`)}
                      >
                        <BarChart2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditLink(link)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(link.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data && data.pagination.pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-muted-foreground">
            {data.pagination.total} total links
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.pagination.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <CreateLinkDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['links'] })
          setShowCreate(false)
        }}
      />

      {/* Edit Dialog */}
      {editLink && (
        <EditLinkDialog
          link={editLink}
          open={!!editLink}
          onOpenChange={(o) => !o && setEditLink(null)}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ['links'] })
            setEditLink(null)
          }}
        />
      )}

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Link</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The short link will stop working immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Create Link Dialog ────────────────────────────────────────────────────────

function CreateLinkDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: () => void
}) {
  const [form, setForm] = useState<CreateLinkPayload>({ destinationUrl: '' })
  const [expiryOption, setExpiryOption] = useState<'never' | '1' | '7' | '30' | 'custom'>('never')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload: CreateLinkPayload = { ...form }
      if (expiryOption !== 'never' && expiryOption !== 'custom') {
        payload.expiryDays = parseInt(expiryOption, 10)
      }
      await linksApi.create(payload)
      toast.success('Link created!')
      setForm({ destinationUrl: '' })
      setExpiryOption('never')
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create link')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Short Link</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="url">Destination URL *</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://example.com/very-long-url"
              value={form.destinationUrl}
              onChange={(e) => setForm((f) => ({ ...f, destinationUrl: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="slug">Custom slug (optional)</Label>
            <Input
              id="slug"
              type="text"
              placeholder="my-link (leave blank for random)"
              value={form.customSlug ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, customSlug: e.target.value || undefined }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="title">Title (optional)</Label>
            <Input
              id="title"
              type="text"
              placeholder="My awesome link"
              value={form.title ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value || undefined }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Expiry</Label>
            <div className="flex flex-wrap gap-2">
              {(['never', '1', '7', '30', 'custom'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setExpiryOption(opt)}
                  className={`px-3 py-1 rounded-md text-sm border transition-colors ${
                    expiryOption === opt
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-input hover:bg-accent'
                  }`}
                >
                  {opt === 'never' ? 'Never' : opt === 'custom' ? 'Custom' : `${opt}d`}
                </button>
              ))}
            </div>
            {expiryOption === 'custom' && (
              <Input
                type="datetime-local"
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    expiresAt: e.target.value
                      ? Math.floor(new Date(e.target.value).getTime() / 1000)
                      : null,
                  }))
                }
              />
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit Link Dialog ──────────────────────────────────────────────────────────

export function EditLinkDialog({
  link,
  open,
  onOpenChange,
  onUpdated,
}: {
  link: Link
  open: boolean
  onOpenChange: (o: boolean) => void
  onUpdated: () => void
}) {
  const [form, setForm] = useState({
    destinationUrl: link.destination_url,
    customSlug: link.slug,
    title: link.title ?? '',
    isActive: !!link.is_active,
  })
  const [expiresAt, setExpiresAt] = useState<number | null>(link.expires_at)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await linksApi.update(link.id, {
        destinationUrl: form.destinationUrl,
        customSlug: form.customSlug,
        title: form.title || undefined,
        isActive: form.isActive,
        expiresAt,
      })
      toast.success('Link updated')
      onUpdated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setLoading(false)
    }
  }

  const expiresAtInputValue = expiresAt
    ? new Date(expiresAt * 1000).toISOString().slice(0, 16)
    : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Link</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Destination URL</Label>
            <Input
              type="url"
              value={form.destinationUrl}
              onChange={(e) => setForm((f) => ({ ...f, destinationUrl: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Slug</Label>
            <Input
              value={form.customSlug}
              onChange={(e) => setForm((f) => ({ ...f, customSlug: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Expiry (leave empty for no expiry)</Label>
            <Input
              type="datetime-local"
              value={expiresAtInputValue}
              onChange={(e) =>
                setExpiresAt(
                  e.target.value ? Math.floor(new Date(e.target.value).getTime() / 1000) : null,
                )
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4"
            />
            <Label htmlFor="active">Active</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
