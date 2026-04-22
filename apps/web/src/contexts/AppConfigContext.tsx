import React, { createContext, useContext, useEffect, useState } from 'react'

interface AppConfig {
  appName: string
  registrationEnabled: boolean
}

interface AppConfigContextType {
  appName: string
  registrationEnabled: boolean
  reload: () => void
}

const AppConfigContext = createContext<AppConfigContextType | null>(null)

async function fetchConfig(): Promise<AppConfig> {
  const res = await fetch('/api/config')
  if (!res.ok) return { appName: 'ShortLink', registrationEnabled: false }
  return res.json() as Promise<AppConfig>
}

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const [appName, setAppName] = useState('ShortLink')
  const [registrationEnabled, setRegistrationEnabled] = useState(false)

  const load = () => {
    fetchConfig().then((c) => {
      setAppName(c.appName)
      setRegistrationEnabled(c.registrationEnabled)
    }).catch(() => {})
  }

  useEffect(() => { load() }, [])

  return (
    <AppConfigContext.Provider value={{ appName, registrationEnabled, reload: load }}>
      {children}
    </AppConfigContext.Provider>
  )
}

export function useAppConfig(): AppConfigContextType {
  const ctx = useContext(AppConfigContext)
  if (!ctx) throw new Error('useAppConfig must be used inside AppConfigProvider')
  return ctx
}
