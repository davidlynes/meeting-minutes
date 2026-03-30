# HeaderContext — Unified Page Header

**Date**: 2026-03-29
**Status**: Approved
**Branch**: feature/mobile-app

## Problem

The mobile app has a dual-layer heading system: `AppHeader` always shows "IQ:capture" with safe area padding, then each page renders its own `<h1>` title (and sometimes its own back button) inside the scrollable content area. This wastes vertical space and means page-level headings don't benefit from the safe area protection that AppHeader provides.

VoxRelay solves this by having each page pass its title into the shared header component. We adopt the same pattern using a React context.

## Design

### New File: `mobile/src/contexts/HeaderContext.tsx`

A React context that stores header configuration and exposes two hooks:

- **`useHeader(props)`** — called by page components to set the header title, subtitle, back button, and right-side content. Sets state on mount, resets to defaults on unmount.
- **`useHeaderContext()`** — called by `AppHeader` to read current header state.

State shape:

```typescript
interface HeaderState {
  title: string        // default: 'IQ:capture'
  subtitle?: string
  showBack: boolean    // default: false
  rightContent?: React.ReactNode
}
```

`useHeader` accepts a partial `HeaderState` and merges with defaults. It runs as a `useEffect` so updates happen when props change (e.g. MeetingDetail loading a meeting title asynchronously).

### Modified File: `mobile/src/components/AppHeader.tsx`

Remove all props. Read header state from `useHeaderContext()` instead. No structural or styling changes — the safe area handling (`paddingTop: calc(12px + env(safe-area-inset-top))`) stays exactly as-is.

### Modified File: `mobile/src/app/layout.tsx`

Wrap `AuthGatedApp` content with `<HeaderProvider>`. Remove `title` prop from `<AppHeader />` calls (both authenticated and unauthenticated paths).

### Modified File: `mobile/src/components/MeetingsList.tsx`

- Add `useHeader({ title: 'Meetings', rightContent: <RefreshButton /> })`
- Remove the `<h1>Meetings</h1>` heading block and its surrounding `<div>` (lines 49-61)
- Extract the Refresh/Sync button into a small inline element passed as `rightContent`

### Modified File: `mobile/src/components/SettingsScreen.tsx`

- Add `useHeader({ title: 'Settings' })`
- Remove the `<h1>Settings</h1>` (line 109)

### Modified File: `mobile/src/components/MeetingDetail.tsx`

- Add `useHeader({ title: meeting?.title || 'Loading...', showBack: true })`
- Update title dynamically when meeting data loads
- Remove the custom back button and title bar (lines 87-95)
- Keep the status indicator and tabs in the content area

### Modified File: `mobile/src/components/RecordingScreen.tsx`

- Add `useHeader({ title: 'Record' })`
- No elements to remove (had no heading)

### Auth Screens (no changes)

Auth screens in `layout.tsx` render `<AppHeader />` without setting any header context, so it defaults to "IQ:capture" — correct behaviour.

## Edge Cases

- **Async title loading** (MeetingDetail): `useHeader` runs in a `useEffect` with the meeting title as a dependency. Shows "Loading..." until data arrives, then updates to the meeting name.
- **Rapid navigation**: `useEffect` cleanup resets header to defaults, preventing stale titles from previous pages.
- **Pages that don't call `useHeader`**: Header falls back to defaults ("IQ:capture", no back button, no right content).

## Out of Scope

- Changing AppHeader visual design or safe area CSS
- Adding page-specific subtitles (supported by the API but no pages need it yet)
- Modifying TabBar or bottom safe area handling
