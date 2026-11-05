// Helpers for mini-project materials (H-10). The server checks every upload
// again; checking here first just saves sending a file it would refuse.

// 4 MB, not more: Vercel refuses request and response bodies over 4.5 MB (H-23).
const MATERIAL_MAX_BYTES = 4 * 1024 * 1024
export const MATERIAL_MAX_FILES = 5

// What is wrong with a chosen file, or '' when it can be uploaded.
export function materialProblem(file) {
  if (!/\.(pdf|zip)$/i.test(file.name)) return 'Only PDF and zip files can be uploaded.'
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MATERIAL_MAX_BYTES) return 'Files can be up to 4 MB.'
  return ''
}

// "820 bytes", "240 KB" or "3.4 MB".
export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Hands a downloaded Blob to the browser as a file to save. The temporary
// link is removed straight away; the object URL is freed a moment later,
// once the browser has started the download.
export function saveFile(blob, name) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
