'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { AuthModal } from './AuthModal'
import Analytics from '@/lib/analytics'

interface AuthGateProps {
  children: React.ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const { isAuthenticated, isLoading } = useAuth()
  const [deviceId, setDeviceId] = useState<string>('')

  useEffect(() => {
    Analytics.getPersistentUserId()
      .then((id) => setDeviceId(id || ''))
      .catch(() => {})
  }, [])

  if (isLoading) {
    return (
      <div
        data-testid="auth-loading"
        className="flex items-center justify-center h-screen w-screen bg-gray-50"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-gray-50">
        <AuthModal
          isOpen={true}
          onClose={() => {}}
          onSuccess={() => {}}
          deviceId={deviceId}
        />
      </div>
    )
  }

  return <>{children}</>
}
