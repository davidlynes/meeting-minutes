'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export function UserProfileMenu() {
  const { user, logout, isAuthenticated } = useAuth()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  if (!isAuthenticated || !user) return null

  const initial = (user.display_name || user.email)[0].toUpperCase()

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-100 text-sm"
      >
        <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-medium">
          {initial}
        </span>
        <span className="text-gray-700 truncate max-w-[120px]">
          {user.display_name || user.email}
        </span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-56 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user.display_name || 'User'}
            </p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
          <div className="px-3 py-1.5 text-xs text-gray-400">
            {user.devices.length} device{user.devices.length !== 1 ? 's' : ''} linked
          </div>
          <button
            onClick={async () => {
              setOpen(false)
              await logout()
            }}
            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}
