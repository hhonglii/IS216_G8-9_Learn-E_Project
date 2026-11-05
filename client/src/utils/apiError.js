// Turns a failed API call into words for the page. The server answers with
// { error: { code, message, details } }, where details lists one { field, message }
// per field it refused. An error with no response never reached the server.

export function apiErrorMessage(err, fallback = 'Something went wrong.') {
  if (!err?.response) return 'Could not reach the server.'
  return err.response.data?.error?.message || fallback
}

// For forms: the per-field messages when the server listed them, since those say
// exactly what to fix; otherwise the overall message.
export function apiErrorDetails(err, fallback) {
  const details = err?.response?.data?.error?.details
  if (Array.isArray(details) && details.length) {
    return details.map((problem) => problem.message).join(' ')
  }
  return apiErrorMessage(err, fallback)
}
