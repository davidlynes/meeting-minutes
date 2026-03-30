'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

interface HeaderState {
  title: string
  subtitle?: string
  showBack: boolean
  rightContent?: ReactNode
}

const DEFAULTS: HeaderState = {
  title: 'IQ:capture',
  showBack: false,
}

interface HeaderContextValue extends HeaderState {
  setHeader: (state: Partial<HeaderState>) => void
  resetHeader: () => void
}

const HeaderContext = createContext<HeaderContextValue | null>(null)

export function useHeaderContext(): HeaderState {
  const ctx = useContext(HeaderContext)
  if (!ctx) throw new Error('useHeaderContext must be used within HeaderProvider')
  return ctx
}

export function useHeader(props: Partial<HeaderState>): void {
  const ctx = useContext(HeaderContext)
  if (!ctx) throw new Error('useHeader must be used within HeaderProvider')

  useEffect(() => {
    ctx.setHeader(props)
    return () => { ctx.resetHeader() }
  }, [props.title, props.subtitle, props.showBack, props.rightContent])
}

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HeaderState>(DEFAULTS)

  const setHeader = useCallback((partial: Partial<HeaderState>) => {
    setState({ ...DEFAULTS, ...partial })
  }, [])

  const resetHeader = useCallback(() => {
    setState(DEFAULTS)
  }, [])

  return (
    <HeaderContext.Provider value={{ ...state, setHeader, resetHeader }}>
      {children}
    </HeaderContext.Provider>
  )
}
