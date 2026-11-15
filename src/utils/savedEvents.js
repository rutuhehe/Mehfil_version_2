const keyFor = (userId) => 'mehfil:saved-events:' + userId

export function getSavedEvents(userId, storage = globalThis.localStorage) {
  if (!userId || !storage) return []
  try {
    const value = JSON.parse(storage.getItem(keyFor(userId)) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function toggleSavedEvent(userId, eventId, storage = globalThis.localStorage) {
  if (!userId || !eventId || !storage) return []
  const current = getSavedEvents(userId, storage)
  const next = current.includes(eventId) ? current.filter((id) => id !== eventId) : [...current, eventId]
  storage.setItem(keyFor(userId), JSON.stringify(next))
  return next
}
