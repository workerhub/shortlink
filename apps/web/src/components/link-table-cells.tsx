import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Copy, ExternalLink, BarChart2, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { buildShortUrl, copyToClipboard, expiryLabel, isExpired } from '@/lib/utils'
import type { Link } from '@/api/client'
import { useTranslation } from '@/i18n'

export function LinkSlugCell({ slug }: { slug: string }) {
  return (
    <td className="px-4 py-3 font-mono">
      <div className="flex items-center gap-1">
        <span className="text-primary">{slug}</span>
        <button
          onClick={() => copyToClipboard(buildShortUrl(slug)).then(() => toast.success('Copied!'))}
          className="text-muted-foreground hover:text-foreground"
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>
    </td>
  )
}

export function LinkDestinationCell({ url }: { url: string }) {
  return (
    <td className="px-4 py-3 max-w-xs">
      <div className="flex items-center gap-1 truncate">
        <span className="truncate text-muted-foreground">{url}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </td>
  )
}

export function LinkExpiryCell({ expiresAt }: { expiresAt: number | null }) {
  return <td className="px-4 py-3 text-muted-foreground">{expiryLabel(expiresAt)}</td>
}

export function LinkStatusCell({
  isActive,
  expiresAt,
}: {
  isActive: number
  expiresAt: number | null
}) {
  const { t } = useTranslation()
  return (
    <td className="px-4 py-3">
      {!isActive ? (
        <Badge variant="secondary">{t('common.inactive')}</Badge>
      ) : isExpired(expiresAt) ? (
        <Badge variant="destructive">{t('common.expired')}</Badge>
      ) : (
        <Badge variant="success">{t('common.active')}</Badge>
      )}
    </td>
  )
}

export function LinkActionCell({
  link,
  onEdit,
  onDelete,
}: {
  link: Link
  onEdit: (link: Link) => void
  onDelete: (id: string) => void
}) {
  const navigate = useNavigate()
  return (
    <td className="px-4 py-3">
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/dashboard/analytics?linkId=${link.id}`)}
        >
          <BarChart2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onEdit(link)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(link.id)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </td>
  )
}
