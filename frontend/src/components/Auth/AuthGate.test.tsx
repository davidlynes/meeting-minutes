import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { AuthGate } from './AuthGate'

// Mock useAuth
const mockUseAuth = vi.fn()
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

// Mock Analytics
vi.mock('@/lib/analytics', () => ({
  default: { getPersistentUserId: vi.fn().mockResolvedValue('test-device-id') },
}))

// Mock AuthModal
vi.mock('./AuthModal', () => ({
  AuthModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="auth-modal">Auth Modal</div> : null,
}))

describe('AuthGate', () => {
  it('shows loading spinner while auth is loading', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true })
    render(<AuthGate><div data-testid="app-content">App</div></AuthGate>)
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('auth-loading')).toBeInTheDocument()
  })

  it('shows auth modal when not authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false })
    render(<AuthGate><div data-testid="app-content">App</div></AuthGate>)
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('auth-modal')).toBeInTheDocument()
  })

  it('renders children when authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false })
    render(<AuthGate><div data-testid="app-content">App</div></AuthGate>)
    expect(screen.getByTestId('app-content')).toBeInTheDocument()
    expect(screen.queryByTestId('auth-modal')).not.toBeInTheDocument()
  })
})
