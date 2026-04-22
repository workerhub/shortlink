import React, { createContext, useContext, useEffect, useState } from 'react'

interface AppConfig {
  appName: string
}

interface AppConfigContextType {
  appName: string
  reload: () => void
}

const AppConfigContext = createContext<AppConfigContextType | null>(null)

async function fetchConfig(): Promise<AppConfig> {
  const res = await fetch('/api/config')
  if (!res.ok) return { appName: 'ShortLink' }
  return res.json() as Promise<AppConfig>
}

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const [appName, setAppName] = useState('ShortLink')

  const load = () => {
    fetchConfig().then((c) => setAppName(c.appName)).catch(() => {})
  }

  useEffect(() => { load() }, [])

  return (
    <AppConfigContext.Provider value={{ appName, reload: load }}>
      {children}
    </AppConfigContext.Provider>
  )
}

export function useAppConfig(): AppConfigContextType {
  const ctx = useContext(AppConfigContext)
  if (!ctx) throw new Error('useAppConfig must be used inside AppConfigProvider')
  return ctx
}
