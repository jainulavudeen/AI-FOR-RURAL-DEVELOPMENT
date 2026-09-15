import { useEffect, useState } from 'react'

const SLOW_EFFECTIVE_TYPES = new Set(['slow-2g', '2g', '3g'])

// Feature-detect navigator.connection — it's absent on iOS Safari and some
// desktop browsers, not just old devices, so its absence must never be read
// as "assume slow." Only an explicit 2G/3G effectiveType or saveData signal
// turns isSlow on; everything else (including "the API doesn't exist here")
// defaults to false.
function getConnection() {
  if (typeof navigator === 'undefined') return null
  return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null
}

function readIsSlow(connection) {
  if (!connection) return false
  return SLOW_EFFECTIVE_TYPES.has(connection.effectiveType) || connection.saveData === true
}

export function useConnectionQuality() {
  const [isSlow, setIsSlow] = useState(() => readIsSlow(getConnection()))

  useEffect(() => {
    const connection = getConnection()
    if (!connection) return

    const handleChange = () => setIsSlow(readIsSlow(connection))
    handleChange()
    connection.addEventListener?.('change', handleChange)
    return () => connection.removeEventListener?.('change', handleChange)
  }, [])

  return { isSlow }
}
