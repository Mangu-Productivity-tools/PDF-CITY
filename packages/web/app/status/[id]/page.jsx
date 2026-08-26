// /status/[id] is the public-facing URL placed in the POST /convert
// `status_url` field.  Redirect to /jobs/[id] which renders the full
// status-polling UI (no auth required — the UUID acts as a capability token).
import { redirect } from 'next/navigation';

export default function StatusRedirectPage({ params }) {
  redirect(`/jobs/${params.id}`);
}
