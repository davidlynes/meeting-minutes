'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as authService from '@/services/authService'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await authService.forgotPassword(email)
      router.push(`/auth/reset-password?email=${encodeURIComponent(email)}`)
    } catch (err: any) {
      setError(err.message || 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-iq-light px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-iq-dark mb-1">IQ:capture</h1>
        <p className="text-sm text-iq-medium mb-6">
          Enter your email and we'll send you a reset code.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="detail-label mb-1 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
              className="w-full px-3 py-2.5 border border-iq-light-shade rounded-iq-lg text-sm text-iq-dark bg-white focus:outline-none focus:ring-2 focus:ring-iq-blue focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>

          {error && (
            <div className="status-banner status-banner-danger">
              <span className="text-sm text-iq-red">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-iq-primary w-full"
          >
            {loading ? 'Sending...' : 'Send Reset Code'}
          </button>
        </form>

        <p className="text-sm text-iq-medium text-center mt-4">
          <Link href="/auth/login" className="text-iq-blue font-semibold">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
