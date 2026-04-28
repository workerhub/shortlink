import { useTranslation } from '@/i18n'

export function ResendCodeButton({
  countdown,
  onResend,
  loading,
}: {
  countdown: number
  onResend: () => void
  loading?: boolean
}) {
  const { t } = useTranslation()

  if (countdown > 0) {
    return <>{t('auth.resendCodeIn', { seconds: String(countdown) })}</>
  }

  return (
    <button
      type="button"
      className="text-primary hover:underline"
      onClick={onResend}
      disabled={loading}
    >
      {t('auth.resendCode')}
    </button>
  )
}
