import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'

export default function AdminSettingsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: adminApi.getSettings,
  })

  const [registrationEnabled, setRegistrationEnabled] = useState(false)
  const [appName, setAppName] = useState('')
  const [savingAppName, setSavingAppName] = useState(false)

  // Email settings
  const [emailProvider, setEmailProvider] = useState<'resend' | 'smtp'>('resend')
  // Resend
  const [resendApiKey, setResendApiKey] = useState('')
  const [emailFromDomain, setEmailFromDomain] = useState('')
  const [emailFromName, setEmailFromName] = useState('')
  // SMTP
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [smtpFrom, setSmtpFrom] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)

  useEffect(() => {
    if (data?.settings) {
      const s = data.settings
      setRegistrationEnabled(s['registration_enabled'] === 'true')
      setAppName(s['app_name'] ?? 'ShortLink')
      setEmailProvider((s['email_provider'] as 'resend' | 'smtp') ?? 'resend')
      setResendApiKey(s['resend_api_key'] ?? '')
      setEmailFromDomain(s['email_from_domain'] ?? '')
      setEmailFromName(s['email_from_name'] ?? '')
      setSmtpHost(s['smtp_host'] ?? '')
      setSmtpPort(s['smtp_port'] ?? '587')
      setSmtpUser(s['smtp_user'] ?? '')
      setSmtpPass(s['smtp_pass'] ?? '')
      setSmtpFrom(s['smtp_from'] ?? '')
    }
  }, [data])

  const handleRegistrationToggle = async (enabled: boolean) => {
    setRegistrationEnabled(enabled)
    try {
      await adminApi.updateSettings({ registration_enabled: enabled ? 'true' : 'false' })
      toast.success(`Registration ${enabled ? 'enabled' : 'disabled'}`)
    } catch (err) {
      setRegistrationEnabled(!enabled)
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  const handleSaveAppName = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingAppName(true)
    try {
      await adminApi.updateSettings({ app_name: appName })
      toast.success('App name updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSavingAppName(false)
    }
  }

  const handleSaveEmailSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingEmail(true)
    try {
      await adminApi.updateSettings({
        email_provider: emailProvider,
        resend_api_key: resendApiKey,
        email_from_domain: emailFromDomain,
        email_from_name: emailFromName,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_user: smtpUser,
        smtp_pass: smtpPass,
        smtp_from: smtpFrom,
      })
      toast.success('Email settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSavingEmail(false)
    }
  }

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Global Settings</h1>

      {/* Registration toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">User Registration</CardTitle>
          <CardDescription>
            Allow new users to register. When disabled, only existing users can sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Switch
              id="reg-toggle"
              checked={registrationEnabled}
              onCheckedChange={handleRegistrationToggle}
            />
            <Label htmlFor="reg-toggle">
              Registration is currently{' '}
              <strong>{registrationEnabled ? 'open' : 'closed'}</strong>
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* App name */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Application Name</CardTitle>
          <CardDescription>Shown in emails and the UI</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveAppName} className="flex gap-3">
            <Input
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="ShortLink"
              className="max-w-xs"
              required
            />
            <Button type="submit" size="sm" loading={savingAppName}>
              Save
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Email provider */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email Provider</CardTitle>
          <CardDescription>
            Configure how the application sends email (used for OTP verification codes).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveEmailSettings} className="space-y-4">
            {/* Provider selector */}
            <div className="space-y-1.5">
              <Label htmlFor="email-provider">Provider</Label>
              <select
                id="email-provider"
                value={emailProvider}
                onChange={(e) => setEmailProvider(e.target.value as 'resend' | 'smtp')}
                className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="resend">Resend</option>
                <option value="smtp">SMTP</option>
              </select>
            </div>

            {/* Resend fields */}
            {emailProvider === 'resend' && (
              <div className="space-y-3 rounded-md border p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="resend-api-key">API Key</Label>
                  <Input
                    id="resend-api-key"
                    value={resendApiKey}
                    onChange={(e) => setResendApiKey(e.target.value)}
                    placeholder="re_xxxxxxxxxxxx"
                    type="password"
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-muted-foreground">
                    Get your API key from{' '}
                    <a
                      href="https://resend.com/api-keys"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      resend.com
                    </a>
                    . Stored in the database; alternatively set the{' '}
                    <code className="text-xs">RESEND_API_KEY</code> Worker secret.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email-from-name">Sender Name</Label>
                  <Input
                    id="email-from-name"
                    value={emailFromName}
                    onChange={(e) => setEmailFromName(e.target.value)}
                    placeholder="ShortLink"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email-from-domain">Sender Domain</Label>
                  <Input
                    id="email-from-domain"
                    value={emailFromDomain}
                    onChange={(e) => setEmailFromDomain(e.target.value)}
                    placeholder="example.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Emails will be sent from <code className="text-xs">noreply@&lt;domain&gt;</code>.
                    The domain must be verified in your Resend account.
                  </p>
                </div>
              </div>
            )}

            {/* SMTP fields */}
            {emailProvider === 'smtp' && (
              <div className="space-y-3 rounded-md border p-4">
                <div className="grid grid-cols-[1fr_120px] gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-host">Host</Label>
                    <Input
                      id="smtp-host"
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      placeholder="smtp.example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-port">Port</Label>
                    <Input
                      id="smtp-port"
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(e.target.value)}
                      placeholder="587"
                      type="number"
                      min={1}
                      max={65535}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="smtp-from">From Address</Label>
                  <Input
                    id="smtp-from"
                    value={smtpFrom}
                    onChange={(e) => setSmtpFrom(e.target.value)}
                    placeholder="noreply@example.com"
                    type="email"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="smtp-user">Username</Label>
                  <Input
                    id="smtp-user"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    placeholder="noreply@example.com"
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="smtp-pass">Password</Label>
                  <Input
                    id="smtp-pass"
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    placeholder="••••••••"
                    type="password"
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-muted-foreground">
                    Credentials are stored in the database.
                  </p>
                </div>
              </div>
            )}

            <Button type="submit" size="sm" loading={savingEmail}>
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
