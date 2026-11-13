function normalizeHost(h) {
  return String(h).trim().toLowerCase()
}

function hostFromLocationValue(v) {
  if (typeof v !== 'string' || !v.trim()) return null
  const s = v.trim()
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `http://${s}`
  try {
    const host = new URL(withScheme).hostname
    return host ? normalizeHost(host) : null
  } catch {
    return null
  }
}

module.exports = { normalizeHost, hostFromLocationValue }
