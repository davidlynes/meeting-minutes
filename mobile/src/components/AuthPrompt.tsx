'use client'

import React from 'react'
import Link from 'next/link'

export default function AuthPrompt() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="w-16 h-16 bg-iq-blue/10 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-iq-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-iq-dark mb-1">IQ:capture</h1>
      <p className="text-sm text-iq-medium mb-6">
        Sign in to record and transcribe your meetings.
      </p>
      <div className="flex gap-3">
        <Link
          href="/auth/login"
          prefetch={false}
          className="btn-iq-primary no-underline inline-block"
        >
          Sign In
        </Link>
        <Link
          href="/auth/register"
          prefetch={false}
          className="btn-iq-outline no-underline inline-block"
        >
          Create Account
        </Link>
      </div>
    </div>
  )
}
