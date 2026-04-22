import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi, setAccessToken } from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme, type Theme } from '@/contexts/ThemeContext'
import { useTranslation, type Lang } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { startRegistration } from '@simplewebauthn/browser'
import { Trash2, Plus, Shield, Mail, Key } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import QRCode from 'qrcode'

export default function SettingsPage() {
  const { user, refreshUser } = useAuth()
  const { t } = useTranslation()

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>
      <PreferencesCard />
      <ChangePasswordCard />
      <TotpCard user={user} onUpdate={refreshUser} />
      <PasskeyCard onUpdate={refreshUser} />
      <EmailOtpCard user={user} onUpdate={refreshUser} />
    </div>
  )
}

// ─── Preferences ──────────────────────────────────────────────────────────────

function PreferencesCard() {
  const { t, lang, setLang } = useTranslation()
  const { theme, setTheme } = useTheme()

  const themes: { value: Theme; label: string }[] = [
    { value: 'light', label: t('settings.light') },
    { value: 'dark', label: t('settings.dark') },
    { value: 'system', label: t('settings.system') },
  ]

  const langs: { value: Lang; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'zh-CN', label: '中文' },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('settings.preferences')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{t('settings.language')}</Label>
          <div className="flex gap-2">
            {langs.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setLang(value)}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  lang === value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-input hover:bg-accent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t('settings.theme')}</Label>
          <div className="flex gap-2">
            {themes.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  theme === value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-input hover:bg-accent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Change Password ──────────────────────────────────────────────────────────

function ChangePasswordCard() {
  const { t } = useTranslation()
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.newPassword !== form.confirm) {
      toast.error(t('settings.passwordsDoNotMatch'))
      return
    }
    setLoading(true)
    try {
      await authApi.changePassword(form.currentPassword, form.newPassword)
      toast.success('Password updated')
      setForm({ currentPassword: '', newPassword: '', confirm: '' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('settings.changePassword')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label>{t('settings.currentPassword')}</Label>
            <Input
              type="password"
              value={form.currentPassword}
              onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1">
            <Label>{t('settings.newPassword')}</Label>
            <Input
              type="password"
              value={form.newPassword}
              onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
              required
              autoComplete="new-password"
              minLength={8}
            />
          </div>
          <div className="space-y-1">
            <Label>{t('settings.confirmPassword')}</Label>
            <Input
              type="password"
              value={form.confirm}
              onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
              required
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" size="sm" loading={loading}>
            {t('settings.updatePassword')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ─── TOTP ─────────────────────────────────────────────────────────────────────

function TotpCard({ user, onUpdate }: { user: ReturnType<typeof useAuth>['user']; onUpdate: () => Promise<void> }) {
  const { t } = useTranslation()
  const [showSetup, setShowSetup] = useState(false)
  const [setupData, setSetupData] = useState<{ secret: string; uri: string } | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (setupData?.uri) {
      QRCode.toDataURL(setupData.uri, { width: 200, margin: 2 })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(null))
    } else {
      setQrDataUrl(null)
    }
  }, [setupData?.uri])
  const [code, setCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')
  const [showDisableDialog, setShowDisableDialog] = useState(false)

  const startSetup = async () => {
    setLoading(true)
    try {
      const data = await authApi.totpSetup()
      setSetupData(data)
      setShowSetup(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  const confirmSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await authApi.totpConfirm(code)
      setBackupCodes(result.backupCodes)
      toast.success('TOTP enabled!')
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  const disable = async () => {
    setLoading(true)
    try {
      await authApi.totpDisable(disablePassword)
      toast.success('TOTP disabled')
      setShowDisableDialog(false)
      setDisablePassword('')
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  const enabled = !!user?.totp_enabled

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <CardTitle className="text-base">{t('settings.totp')}</CardTitle>
          </div>
          <Badge variant={enabled ? 'success' : 'secondary'}>
            {enabled ? t('settings.enabled') : t('settings.disabled')}
          </Badge>
        </div>
        <CardDescription>{t('settings.totpDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {!enabled ? (
          <Button size="sm" onClick={startSetup} loading={loading}>
            <Plus className="h-4 w-4" />
            {t('settings.enableTotp')}
          </Button>
        ) : (
          <Button size="sm" variant="destructive" onClick={() => setShowDisableDialog(true)} loading={loading}>
            {t('settings.disableTotp')}
          </Button>
        )}
      </CardContent>

      <Dialog open={showSetup} onOpenChange={(o) => { if (!o) { setShowSetup(false); setSetupData(null); setCode(''); setBackupCodes([]) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.setUpAuthApp')}</DialogTitle>
          </DialogHeader>
          {backupCodes.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('settings.totpEnabled')}</p>
              <div className="bg-muted rounded-md p-3 font-mono text-sm grid grid-cols-2 gap-1">
                {backupCodes.map((c) => <div key={c}>{c}</div>)}
              </div>
              <Button className="w-full" onClick={() => { setShowSetup(false); setBackupCodes([]) }}>
                {t('settings.done')}
              </Button>
            </div>
          ) : setupData ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t('settings.scanQrCode')}</p>
              <div className="flex justify-center bg-white rounded-md p-3">
                {qrDataUrl
                  ? <img src={qrDataUrl} alt="TOTP QR code" width={200} height={200} />
                  : <p className="text-xs font-mono break-all text-black">{setupData.uri}</p>
                }
              </div>
              <p className="text-xs text-muted-foreground">
                {t('settings.manualSecret')} <span className="font-mono">{setupData.secret}</span>
              </p>
              <form onSubmit={confirmSetup} className="space-y-3">
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  autoComplete="one-time-code"
                />
                <Button type="submit" className="w-full" loading={loading} disabled={code.length < 6}>
                  {t('settings.confirm')}
                </Button>
              </form>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={showDisableDialog} onOpenChange={(o) => { if (!o) { setShowDisableDialog(false); setDisablePassword('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.disableTotp')}</DialogTitle>
            <DialogDescription>{t('settings.confirmCurrentPassword')}</DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            placeholder={t('settings.currentPassword')}
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowDisableDialog(false); setDisablePassword('') }}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={disable} loading={loading} disabled={!disablePassword}>
              {t('settings.disable')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function PasskeyCard({ onUpdate }: { onUpdate: () => Promise<void> }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['passkeys'],
    queryFn: authApi.passkeyList,
  })
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deletePassword, setDeletePassword] = useState('')

  const register = async () => {
    setLoading(true)
    try {
      const { options, challengeId } = await authApi.passkeyRegisterOptions()
      const response = await startRegistration(options)
      await authApi.passkeyRegisterVerify(response, challengeId, newName || undefined)
      toast.success('Passkey registered!')
      setNewName('')
      queryClient.invalidateQueries({ queryKey: ['passkeys'] })
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const deletePasskey = async () => {
    if (!deleteId || !deletePassword) return
    setLoading(true)
    try {
      await authApi.passkeyDelete(deleteId, deletePassword)
      toast.success('Passkey removed')
      setDeleteId(null)
      setDeletePassword('')
      queryClient.invalidateQueries({ queryKey: ['passkeys'] })
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4" />
          <CardTitle className="text-base">{t('settings.passkeys')}</CardTitle>
        </div>
        <CardDescription>{t('settings.passkeysDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data?.passkeys.map((pk) => (
          <div key={pk.id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
            <div>
              <p className="font-medium">{pk.name ?? t('settings.unnamedKey')}</p>
              <p className="text-muted-foreground text-xs">
                {t('settings.added', { date: formatDate(pk.created_at) })}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setDeleteId(pk.id)} className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <Input
            placeholder={t('settings.keyName')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="max-w-xs"
          />
          <Button size="sm" onClick={register} loading={loading}>
            <Plus className="h-4 w-4" />
            {t('settings.addPasskey')}
          </Button>
        </div>
      </CardContent>

      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) { setDeleteId(null); setDeletePassword('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.removePasskey')}</DialogTitle>
            <DialogDescription>{t('settings.removePasskeyDesc')}</DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            placeholder={t('settings.currentPassword')}
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDeleteId(null); setDeletePassword('') }}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={deletePasskey} loading={loading} disabled={!deletePassword}>
              {t('settings.remove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ─── Email OTP ────────────────────────────────────────────────────────────────

function EmailOtpCard({ user, onUpdate }: { user: ReturnType<typeof useAuth>['user']; onUpdate: () => Promise<void> }) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')
  const [showDisableDialog, setShowDisableDialog] = useState(false)
  const enabled = !!user?.email_2fa_enabled

  const enable = async () => {
    setLoading(true)
    try {
      await authApi.emailOtpEnable()
      toast.success('Email OTP enabled')
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  const disable = async () => {
    setLoading(true)
    try {
      await authApi.emailOtpDisable(disablePassword)
      toast.success('Email OTP disabled')
      setShowDisableDialog(false)
      setDisablePassword('')
      onUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <CardTitle className="text-base">{t('settings.emailOtp')}</CardTitle>
          </div>
          <Badge variant={enabled ? 'success' : 'secondary'}>
            {enabled ? t('settings.enabled') : t('settings.disabled')}
          </Badge>
        </div>
        <CardDescription>{t('settings.emailOtpDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          size="sm"
          variant={enabled ? 'destructive' : 'default'}
          onClick={enabled ? () => setShowDisableDialog(true) : enable}
          loading={loading}
        >
          {enabled ? t('settings.disableEmailOtp') : t('settings.enableEmailOtp')}
        </Button>
      </CardContent>

      <Dialog open={showDisableDialog} onOpenChange={(o) => { if (!o) { setShowDisableDialog(false); setDisablePassword('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.disableEmailOtp')}</DialogTitle>
            <DialogDescription>{t('settings.confirmCurrentPassword')}</DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            placeholder={t('settings.currentPassword')}
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowDisableDialog(false); setDisablePassword('') }}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={disable} loading={loading} disabled={!disablePassword}>
              {t('settings.disable')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
