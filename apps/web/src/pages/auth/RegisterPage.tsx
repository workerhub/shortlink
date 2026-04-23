import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi, setAccessToken } from '@/api/client'
import { useAppConfig } from '@/contexts/AppConfigContext'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { useTranslation } from '@/i18n'

type Step = 'form' | 'verify'

export default function RegisterPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { registrationEnabled } = useAppConfig()
  const { refreshUser, broadcastLogin } = useAuth()
  const [step, setStep] = useState<Step>('form')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState('')
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (!registrationEnabled) navigate('/login', { replace: true })
  }, [registrationEnabled, navigate])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await authApi.register(email, username, password)
      if (result.requiresEmailVerification && result.userId) {
        setUserId(result.userId)
        setCountdown(600)
        setStep('verify')
      } else {
        toast.success(t('auth.accountCreated'))
        navigate('/login')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await authApi.verifyEmail(userId, code)
      if (result.accessToken) {
        setAccessToken(result.accessToken)
        broadcastLogin(result.accessToken)
      }
      await refreshUser()
      navigate('/dashboard')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setLoading(true)
    try {
      await authApi.resendVerifyEmail(userId)
      setCode('')
      setCountdown(600)
      toast.success(t('auth.verifyCodeResent'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resend code')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'verify') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">{t('auth.verifyEmailTitle')}</CardTitle>
            <CardDescription>
              {t('auth.verifyEmailDesc', { email })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-4">{t('auth.codeValidFor')}</p>
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-1">
                <Label>{t('auth.verificationCode')}</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" loading={loading} disabled={code.length < 6}>
                {t('auth.verify')}
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
          <CardTitle className="text-2xl">{t('auth.createAccount')}</CardTitle>
          <CardDescription>{t('auth.createAccountDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="username">{t('auth.username')}</Label>
              <Input
                id="username"
                type="text"
                placeholder="johndoe"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
              />
              <p className="text-xs text-muted-foreground">{t('auth.passwordHint')}</p>
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              {t('auth.createAccount')}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t('auth.alreadyAccount')}{' '}
            <Link to="/login" className="text-primary hover:underline">
              {t('auth.signInLink')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
