'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import { List, Mic, Settings } from 'lucide-react'

const tabs = [
  { href: '/index.html', label: 'Meetings', icon: List },
  { href: '/record/index.html', label: 'Record', icon: Mic },
  { href: '/settings/index.html', label: 'Settings', icon: Settings },
]

export default function TabBar() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-iq-light border-t border-iq-light-shade pb-[var(--safe-area-bottom)] z-50">
      <div className="flex items-center justify-around h-14">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === '/index.html'
            ? pathname === '/' || pathname === '' || pathname === '/index.html'
            : pathname.startsWith(href.replace(/\/index\.html$/, ''))

          return (
            <a
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-4 py-1 transition-colors ${
                active ? 'text-iq-blue' : 'text-iq-medium'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold">{label}</span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}
