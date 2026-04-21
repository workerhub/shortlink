import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi, setAccessToken } from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
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

export default function SettingsPage() {
  const { user, refreshUser } = useAuth()

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Account Settings</h1>
      <ChangePasswordCard />
      <TotpCard user={user} onUpdate={refreshUser} />
      <PasskeyCard onUpdate={refreshUser} />
      <EmailOtpCard user={user} onUpdate={refreshUser} />
    </div>
  )
}

// ─── Change Password ──────────────────────────────────────────────────────────

function ChangePasswordCard() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.newPassword !== form.confirm) {
      toast.error('Passwords do not match')
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
        <CardTitle className="text-base">Change Password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label>Current Password</Label>
            <Input
              type="password"
              value={form.currentPassword}
              onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1">
            <Label>New Password</Label>
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
            <Label>Confirm New Password</Label>
            <Input
              type="password"
              value={form.confirm}
              onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
              required
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" size="sm" loading={loading}>
            Update Password
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ─── TOTP ─────────────────────────────────────────────────────────────────────

function TotpCard({ user, onUpdate }: { user: ReturnType<typeof useAuth>['user']; onUpdate: () => Promise<void> }) {
  const [showSetup, setShowSetup] = useState(false)
  const [setupData, setSetupData] = useState<{ secret: string; uri: string } | null>(null)
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
            <CardTitle className="text-base">Authenticator App (TOTP)</CardTitle>
          </div>
          <Badge variant={enabled ? 'success' : 'secondary'}>{enabled ? 'Enabled' : 'Disabled'}</Badge>
        </div>
        <CardDescription>Use an authenticator app like Google Authenticator</CardDescription>
      </CardHeader>
      <CardContent>
        {!enabled ? (
          <Button size="sm" onClick={startSetup} loading={loading}>
            <Plus className="h-4 w-4" />
            Enable TOTP
          </Button>
        ) : (
          <Button size="sm" variant="destructive" onClick={() => setShowDisableDialog(true)} loading={loading}>
            Disable TOTP
          </Button>
        )}
      </CardContent>

      <Dialog open={showSetup} onOpenChange={(o) => { if (!o) { setShowSetup(false); setSetupData(null); setCode(''); setBackupCodes([]) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Up Authenticator App</DialogTitle>
          </DialogHeader>
          {backupCodes.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                TOTP enabled! Save these backup codes — they will not be shown again.
              </p>
              <div className="bg-muted rounded-md p-3 font-mono text-sm grid grid-cols-2 gap-1">
                {backupCodes.map((c) => <div key={c}>{c}</div>)}
              </div>
              <Button className="w-full" onClick={() => { setShowSetup(false); setBackupCodes([]) }}>Done</Button>
            </div>
          ) : setupData ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Scan this QR code with your authenticator app, then enter the 6-digit code.
              </p>
              <div className="bg-muted rounded-md p-3">
                <p className="text-xs font-mono break-all">{setupData.uri}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Or manually enter the secret: <span className="font-mono">{setupData.secret}</span>
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
                  Confirm
                </Button>
              </form>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={showDisableDialog} onOpenChange={(o) => { if (!o) { setShowDisableDialog(false); setDisablePassword('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable TOTP</DialogTitle>
            <DialogDescription>Enter your current password to confirm.</DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            placeholder="Current password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowDisableDialog(false); setDisablePassword('') }}>Cancel</Button>
            <Button variant="destructive" onClick={disable} loading={loading} disabled={!disablePassword}>
              Disable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function PasskeyCard({ onUpdate }: { onUpdate: () => Promise<void> }) {
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
          <CardTitle className="text-base">Passkeys</CardTitle>
        </div>
        <CardDescription>Use biometrics or security keys to verify</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data?.passkeys.map((pk) => (
          <div key={pk.id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
            <div>
              <p className="font-medium">{pk.name ?? 'Unnamed key'}</p>
              <p className="text-muted-foreground text-xs">Added {formatDate(pk.created_at)}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setDeleteId(pk.id)} className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <Input
            placeholder="Key name (optional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="max-w-xs"
          />
          <Button size="sm" onClick={register} loading={loading}>
            <Plus className="h-4 w-4" />
            Add Passkey
          </Button>
        </div>
      </CardContent>

      {/* H-3: Password confirmation required to remove a passkey */}
      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) { setDeleteId(null); setDeletePassword('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Passkey</DialogTitle>
            <DialogDescription>Enter your current password to confirm removal.</DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            placeholder="Current password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDeleteId(null); setDeletePassword('') }}>Cancel</Button>
            <Button variant="destructive" onClick={deletePasskey} loading={loading} disabled={!deletePassword}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ─── Email OTP ────────────────────────────────────────────────────────────────

function EmailOtpCard({ user, onUpdate }: { user: ReturnType<typeof useAuth>['user']; onUpdate: () => Promise<void> }) {
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
            <CardTitle className="text-base">Email OTP</CardTitle>
          </div>
          <Badge variant={enabled ? 'success' : 'secondary'}>{enabled ? 'Enabled' : 'Disabled'}</Badge>
        </div>
        <CardDescription>Receive a one-time code via email when signing in</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          size="sm"
          variant={enabled ? 'destructive' : 'default'}
          onClick={enabled ? () => setShowDisableDialog(true) : enable}
          loading={loading}
        >
          {enabled ? 'Disable Email OTP' : 'Enable Email OTP'}
        </Button>
      </CardContent>

      <Dialog open={showDisableDialog} onOpenChange={(o) => { if (!o) { setShowDisableDialog(false); setDisablePassword('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable Email OTP</DialogTitle>
            <DialogDescription>Enter your current password to confirm.</DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            placeholder="Current password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowDisableDialog(false); setDisablePassword('') }}>Cancel</Button>
            <Button variant="destructive" onClick={disable} loading={loading} disabled={!disablePassword}>
              Disable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
