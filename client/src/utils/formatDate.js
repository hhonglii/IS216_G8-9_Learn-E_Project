// One date style on every page (UX audit 25): "4 Nov 2026, 9:53 am". The
// month is a word, so 04/11 can't be read as April 11. Times show in the
// reader's own time zone. A missing or unreadable date shows nothing.
const day = { day: 'numeric', month: 'short', year: 'numeric' }

function readable(value) {
  const time = new Date(value)
  return value && !Number.isNaN(time.getTime()) ? time : null
}

export function formatDateTime(value) {
  const time = readable(value)
  return time ? time.toLocaleString('en-SG', { ...day, hour: 'numeric', minute: '2-digit' }) : ''
}

export function formatDate(value) {
  const time = readable(value)
  return time ? time.toLocaleDateString('en-SG', day) : ''
}
