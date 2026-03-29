import MeetingDetailClient from './client'

// Required for output: 'export' with dynamic routes
export function generateStaticParams() {
  return []
}

export default function MeetingDetailPage({
  params,
}: {
  params: { id: string }
}) {
  return <MeetingDetailClient id={params.id} />
}
