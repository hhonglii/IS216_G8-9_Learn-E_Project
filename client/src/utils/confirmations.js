// The questions asked before a one-way step. A deleted draft can't be brought
// back, and published work is seen by students at once and locked for editing.

export const confirmDeleteDraft = (title) =>
  window.confirm(`Delete the draft "${title}"? This can't be undone.`)

export const confirmPublish = (title, action) =>
  window.confirm(
    `Publish "${title}"? Students can ${action} straight away, and you can't edit it after that.`,
  )
