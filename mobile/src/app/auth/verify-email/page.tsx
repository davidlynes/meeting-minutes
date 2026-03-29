'use client'

import React, { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import * as authService from '@/services/authService'
import Link from 'next/link'

export default function VerifyEmailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const emailParam = searchParams.get('email') || ''
  const codeParam = searchParams.get('code') || ''

  const [code, setCode] = useState(codeParam)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendMsg, setResendMsg] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await authService.verifyEmail(emailParam, code)
      router.replace('/auth/login?verified=1')
    } catch (err: any) {
      setError(err.message || 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResendMsg(null)
    setError(null)
    try {
      await authService.resendVerification(emailParam)
      setResendMsg('A new code has been sent to your email.')
    } catch (err: any) {
      setError(err.message || 'Failed to resend code')
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-iq-light px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-iq-dark mb-1">IQ:capture</h1>
        <p className="text-sm text-iq-medium mb-6">
          Enter the 6-digit code sent to <span className="font-medium">{emailParam}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="detail-label mb-1 block">Verification code</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
              autoFocus
              className="w-full px-3 py-2.5 border border-iq-light-shade rounded-iq-lg text-sm text-iq-dark bg-white text-center tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-iq-blue focus:border-transparent"
              placeholder="000000"
            />
          </div>

          {error && (
            <div className="status-banner status-banner-danger">
              <span className="text-sm text-iq-red">{error}</span>
            </div>
          )}
          {resendMsg && (
            <div className="status-banner status-banner-success">
              <span className="text-sm text-iq-green">{resendMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="btn-iq-primary w-full"
          >
            {loading ? 'Verifying...' : 'Verify Email'}
          </button>
        </form>

        <div className="mt-4 text-center space-y-2">
          <button
            onClick={handleResend}
            className="text-sm text-iq-blue font-semibold"
          >
            Resend code
          </button>
          <p className="text-sm text-iq-medium">
            <Link href="/auth/login" className="text-iq-blue font-semibold">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
