import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { useTranslation } from '@/i18n'

type Step = 'email' | 'code' | 'password'

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  // Step 1: submit email — always advance, never surface errors (no user enumeration)
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
    } catch {
      // Silently ignore — the user should never know whether the email exists
    } finally {
      setLoading(false)
    }
    setCountdown(600)
    setStep('code')
  }

  // Step 2: verify code — if correct, advance to password step
  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await authApi.verifyResetCode(email, code)
      setStep('password')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  // Resend code (resets countdown)
  const handleResend = async () => {
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
    } catch {
      // Silently ignore
    } finally {
      setLoading(false)
    }
    setCode('')
    setCountdown(600)
  }

  // Step 3: set new password
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error(t('settings.passwordsDoNotMatch'))
      return
    }
    setLoading(true)
    try {
      await authApi.resetPassword(email, code, newPassword)
      toast.success(t('auth.resetSuccess'))
      navigate('/login')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'password') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">{t('auth.newPasswordTitle')}</CardTitle>
            <CardDescription>{t('auth.newPasswordDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label>{t('settings.newPassword')}</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">{t('auth.passwordHint')}</p>
              </div>
              <div className="space-y-1">
                <Label>{t('settings.confirmPassword')}</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full" loading={loading}>
                {t('auth.resetPassword')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (step === 'code') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">{t('auth.forgotPasswordTitle')}</CardTitle>
            <CardDescription>
              {t('auth.resetCodeSentTo', { email })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-4">{t('auth.codeValidFor')}</p>
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label>{t('auth.resetCode')}</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder={t('auth.resetCodePlaceholder')}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" loading={loading}>
                {t('auth.verifyCode')}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {countdown > 0 ? (
                t('auth.resendCodeIn', { seconds: String(countdown) })
              ) : (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={handleResend}
                  disabled={loading}
                >
                  {t('auth.resendCode')}
                </button>
              )}
            </p>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              <Link to="/login" className="text-primary hover:underline">
                {t('auth.backToLogin')}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{t('auth.forgotPasswordTitle')}</CardTitle>
          <CardDescription>{t('auth.forgotPasswordDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>{t('auth.email')}</Label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              {t('auth.sendResetCode')}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link to="/login" className="text-primary hover:underline">
              {t('auth.backToLogin')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
