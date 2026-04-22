import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, linksApi } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Search, Trash2, ExternalLink, Pencil, Copy, BarChart2 } from 'lucide-react'
import { buildShortUrl, copyToClipboard, expiryLabel, isExpired, formatDate } from '@/lib/utils'
import { EditLinkDialog } from '@/pages/dashboard/LinksPage'
import type { Link } from '@/api/client'
import { useTranslation } from '@/i18n'

export default function AdminLinksPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editLink, setEditLink] = useState<Link | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-links', page, search],
    queryFn: () => adminApi.links({ page, search: search || undefined }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => linksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-links'] })
      toast.success('Link deleted')
      setDeleteId(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">{t('admin.allLinks')}</h1>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('admin.searchLinksPlaceholder')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium w-12">#</th>
                <th className="px-4 py-3 text-left font-medium">{t('links.shortLink')}</th>
                <th className="px-4 py-3 text-left font-medium">{t('links.destination')}</th>
                <th className="px-4 py-3 text-left font-medium">{t('common.user')}</th>
                <th className="px-4 py-3 text-left font-medium">{t('links.clicks')}</th>
                <th className="px-4 py-3 text-left font-medium">{t('links.expiry')}</th>
                <th className="px-4 py-3 text-left font-medium">{t('common.status')}</th>
                <th className="px-4 py-3 text-left font-medium">{t('common.created')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data?.links.map((link) => (
                <tr key={link.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 text-muted-foreground text-xs">{link.seq}</td>
                  <td className="px-4 py-3 font-mono">
                    <div className="flex items-center gap-1">
                      <span className="text-primary">{link.slug}</span>
                      <button
                        onClick={() =>
                          copyToClipboard(buildShortUrl(link.slug)).then(() => toast.success('Copied!'))
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
                      <a href={link.destination_url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{link.user_username}</td>
                  <td className="px-4 py-3 text-muted-foreground">{link.click_count ?? 0}</td>
                  <td className="px-4 py-3 text-muted-foreground">{expiryLabel(link.expires_at)}</td>
                  <td className="px-4 py-3">
                    {!link.is_active ? (
                      <Badge variant="secondary">{t('common.inactive')}</Badge>
                    ) : isExpired(link.expires_at) ? (
                      <Badge variant="destructive">{t('common.expired')}</Badge>
                    ) : (
                      <Badge variant="success">{t('common.active')}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(link.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
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

      {data && data.pagination.pages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <span className="text-sm text-muted-foreground">
            {t('admin.totalLinks', { count: data.pagination.total })}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t('common.previous')}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= data.pagination.pages} onClick={() => setPage((p) => p + 1)}>
              {t('common.next')}
            </Button>
          </div>
        </div>
      )}

      {editLink && (
        <EditLinkDialog
          link={editLink}
          open={!!editLink}
          onOpenChange={(o) => !o && setEditLink(null)}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-links'] })
            setEditLink(null)
          }}
        />
      )}

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.deleteLink')}</DialogTitle>
            <DialogDescription>{t('admin.deleteLinkDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
