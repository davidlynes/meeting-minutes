'use client'

import React from 'react'
import MeetingDetail from '@/components/MeetingDetail'

export default function MeetingDetailClient({ id }: { id: string }) {
  return <MeetingDetail meetingId={id} />
}
