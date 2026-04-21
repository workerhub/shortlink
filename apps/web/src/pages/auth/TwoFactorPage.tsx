import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { authApi, setAccessToken } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { startAuthentication } from '@simplewebauthn/browser'
import type { LoginResult } from '@/api/client'

type Tab = 'totp' | 'email_otp' | 'passkey'

export default function TwoFactorPage() {
  const { pendingToken, pendingMethods, clearPendingState, refreshUser, broadcastLogin } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>(
    (pendingMethods[0] as Tab | undefined) ?? 'totp',
  )
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [otpSent, setOtpSent] = useState(false)

  if (!pendingToken) {
    navigate('/login')
    return null
  }

  const handleSuccess = (result: LoginResult) => {
    if (result.accessToken) {
      setAccessToken(result.accessToken)
      // H4: refresh token is set as HttpOnly cookie by the server
      // H-1: Broadcast token so sibling tabs adopt it without their own refresh
      broadcastLogin(result.accessToken)
    }
    clearPendingState()
    refreshUser().then(() => navigate('/dashboard'))
  }

  const handleTotpVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await authApi.totpVerify(pendingToken, code)
      handleSuccess(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  const handleEmailSend = async () => {
    setLoading(true)
    try {
      await authApi.emailOtpSend(pendingToken)
      setOtpSent(true)
      toast.success('Code sent to your email')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send code')
    } finally {
      setLoading(false)
    }
  }

  const handleEmailVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await authApi.emailOtpVerify(pendingToken, code)
      handleSuccess(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  const handlePasskey = async () => {
    setLoading(true)
    try {
      const { options, challengeId } = await authApi.passkeyVerifyOptions(pendingToken)
      const response = await startAuthentication(options)
      const result = await authApi.passkeyVerify(pendingToken, response, challengeId)
      handleSuccess(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Passkey authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const tabs = pendingMethods.filter((m): m is Tab =>
    ['totp', 'email_otp', 'passkey'].includes(m),
  )
  const tabLabels: Record<Tab, string> = {
    totp: 'Authenticator App',
    email_otp: 'Email Code',
    passkey: 'Passkey',
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>Verify your identity to continue</CardDescription>
        </CardHeader>
        <CardContent>
          {tabs.length > 1 && (
            <div className="flex gap-1 mb-6 border-b">
              {tabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTab(t); setCode(''); setOtpSent(false) }}
                  className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    tab === t
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tabLabels[t]}
                </button>
              ))}
            </div>
          )}

          {tab === 'totp' && (
            <form onSubmit={handleTotpVerify} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="totp-code">6-digit code</Label>
                <Input
                  id="totp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" loading={loading} disabled={code.length < 6}>
                Verify
              </Button>
            </form>
          )}

          {tab === 'email_otp' && (
            <div className="space-y-4">
              {!otpSent ? (
                <Button className="w-full" onClick={handleEmailSend} loading={loading}>
                  Send verification code
                </Button>
              ) : (
                <form onSubmit={handleEmailVerify} className="space-y-4">
                  <div className="space-y-1">
                    <Label htmlFor="email-code">6-digit code from email</Label>
                    <Input
                      id="email-code"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      placeholder="000000"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      autoComplete="one-time-code"
                      autoFocus
                    />
                  </div>
                  <Button type="submit" className="w-full" loading={loading} disabled={code.length < 6}>
                    Verify
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={handleEmailSend}>
                    Resend code
                  </Button>
                </form>
              )}
            </div>
          )}

          {tab === 'passkey' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Use your registered passkey (fingerprint, face ID, or security key) to verify.
              </p>
              <Button className="w-full" onClick={handlePasskey} loading={loading}>
                Verify with Passkey
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
