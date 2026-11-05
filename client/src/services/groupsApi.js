// ════════════════════════════════════════════════════════════════════
//  Learn-E — mini-project and group wrappers
//  What each call sends, which the handlers must accept:
//    createMiniProject    the brief so far; it is saved as a draft (H-8)
//    updateMiniProject    the draft's fields; a published brief answers 409
//    publishMiniProject   nothing; the server checks the saved draft
//    getMiniProject       nothing; one DTO feeds the page
//    uploadMaterial       the raw file, its name in the X-File-Name header (H-10)
//    downloadMaterial     nothing; the file comes back as a Blob
//    deleteMaterial       nothing
//    createGroup          { name }
//    joinGroup            an EMPTY body, so the server decides everything
//    leaveGroup           an EMPTY body too; the server clears the leaver's tasks
//    replaceTasks         { tasks, updatedAt }  <- the COMPLETE array, not one task
//    updateStageEvidence  { stageEvidence }
//    attachRepository     { repositoryUrl }
//    submitGroup / reviewGroup  the form payload
// ════════════════════════════════════════════════════════════════════
import { api } from './api.js'

// Return the JSON success envelope; reject errors for the owning view to display.

export async function createMiniProject(classroomId, payload) {
  const result = await api.post(
    `/classrooms/${encodeURIComponent(classroomId)}/mini-projects`,
    payload,
  )
  return result.data
}

export async function updateMiniProject(miniProjectId, payload) {
  const result = await api.put(`/mini-projects/${encodeURIComponent(miniProjectId)}`, payload)
  return result.data
}

// Removes a draft and its files for good; the server refuses a published one.
export async function deleteMiniProject(miniProjectId) {
  await api.delete(`/mini-projects/${encodeURIComponent(miniProjectId)}`)
}

export async function publishMiniProject(miniProjectId) {
  const result = await api.post(`/mini-projects/${encodeURIComponent(miniProjectId)}/publish`, {})
  return result.data
}

export async function getMiniProject(miniProjectId) {
  const result = await api.get(`/mini-projects/${encodeURIComponent(miniProjectId)}`)
  return result.data
}

// Files can be up to 4 MB, so uploads and downloads get a minute instead of
// the usual ten seconds.
const fileTimeout = 60000

// The body is the file itself. Its name goes URI-encoded in a header, since a
// header can't carry most non-ASCII characters; the server decodes it.
export async function uploadMaterial(miniProjectId, file) {
  const result = await api.post(
    `/mini-projects/${encodeURIComponent(miniProjectId)}/materials`,
    file,
    {
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
      },
      timeout: fileTimeout,
    },
  )
  return result.data
}

// Resolves to the file as a Blob. The download needs the session header, which a
// plain link can't send, so the page saves the Blob itself.
export async function downloadMaterial(miniProjectId, materialId) {
  try {
    const result = await api.get(
      `/mini-projects/${encodeURIComponent(miniProjectId)}/materials/${encodeURIComponent(materialId)}`,
      { responseType: 'blob', timeout: fileTimeout },
    )
    return result.data
  } catch (err) {
    // An error still answers JSON, but asking for a Blob means axios hands it
    // back as one. Reading it here lets the page show the server's message.
    const data = err.response?.data
    if (data instanceof Blob) {
      try {
        err.response.data = JSON.parse(await data.text())
      } catch {
        err.response.data = {}
      }
    }
    throw err
  }
}

export async function deleteMaterial(miniProjectId, materialId) {
  await api.delete(
    `/mini-projects/${encodeURIComponent(miniProjectId)}/materials/${encodeURIComponent(materialId)}`,
  )
}

export async function createGroup(miniProjectId, payload) {
  const result = await api.post(
    `/mini-projects/${encodeURIComponent(miniProjectId)}/groups`,
    payload,
  )
  return result.data
}

export async function joinGroup(groupId) {
  const result = await api.put(`/groups/${encodeURIComponent(groupId)}/join`, {})
  return result.data
}

export async function leaveGroup(groupId) {
  const result = await api.put(`/groups/${encodeURIComponent(groupId)}/leave`, {})
  return result.data
}

export async function replaceTasks(groupId, tasks, updatedAt) {
  const result = await api.put(`/groups/${encodeURIComponent(groupId)}/tasks`, { tasks, updatedAt })
  return result.data
}

export async function updateStageEvidence(groupId, stageEvidence) {
  const result = await api.put(`/groups/${encodeURIComponent(groupId)}/stages`, { stageEvidence })
  return result.data
}

export async function attachRepository(groupId, repositoryUrl) {
  const result = await api.put(`/groups/${encodeURIComponent(groupId)}/repository`, {
    repositoryUrl,
  })
  return result.data
}

export async function submitGroup(groupId, payload) {
  const result = await api.put(`/groups/${encodeURIComponent(groupId)}/submit`, payload)
  return result.data
}

export async function reviewGroup(groupId, payload) {
  const result = await api.put(`/groups/${encodeURIComponent(groupId)}/review`, payload)
  return result.data
}
