// After a redeploy, a tab opened earlier still asks for the old build's page
// files. The new deployment doesn't have them, so a link to another page does
// nothing. Vite reports that as a vite:preloadError event, and reloading the
// page fetches the new build. A reload in the last few seconds means the files
// are really unreachable (an outage, not a redeploy), so the error is left
// alone rather than reloading forever; without storage there is no way to
// tell, so it never reloads.
const lastReloadKey = 'le-stale-build-reload'
export const RELOAD_GAP_MS = 10000

export function reloadForNewBuild(
  event,
  {
    storage = window.sessionStorage,
    reload = () => window.location.reload(),
    now = Date.now(),
  } = {},
) {
  try {
    if (now - (Number(storage.getItem(lastReloadKey)) || 0) < RELOAD_GAP_MS) return
    storage.setItem(lastReloadKey, String(now))
  } catch {
    return
  }
  event.preventDefault()
  reload()
}
