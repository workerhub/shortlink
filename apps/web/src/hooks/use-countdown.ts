import { useState, useEffect, useCallback } from 'react'

export function useCountdown() {
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const start = useCallback((seconds: number) => setCountdown(seconds), [])

  return { countdown, start }
}
