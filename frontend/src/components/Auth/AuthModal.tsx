'use client'

import React, { useState, useEffect } from 'react'
import { LoginForm } from './LoginForm'
import { RegisterForm } from './RegisterForm'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  deviceId: string
}

export function AuthModal({ isOpen, onClose, onSuccess, deviceId }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')

  // Reset to login when modal opens
  useEffect(() => {
    if (isOpen) setMode('login')
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {mode === 'login' ? (
          <LoginForm
            deviceId={deviceId}
            onSwitchToRegister={() => setMode('register')}
            onSuccess={onSuccess}
          />
        ) : (
          <RegisterForm
            deviceId={deviceId}
            onSwitchToLogin={() => setMode('login')}
            onSuccess={onSuccess}
          />
        )}
      </div>
    </div>
  )
}
