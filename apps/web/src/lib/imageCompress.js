// "Compress hard before upload" — downscale to a max dimension and
// re-encode as JPEG at a modest quality before the photo ever touches the
// network. A typical modern phone camera photo (3-8 MB) becomes tens of
// KB, appropriate for a 2G/small-data-pack upload and for the server-side
// size backstop (apps/api's siteCapture/service.ts: MAX_PHOTO_DATA_URL_LENGTH).
const MAX_DIMENSION = 800
const JPEG_QUALITY = 0.6

export async function compressImageFile(file) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas compression produced no blob'))
          return
        }
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      },
      'image/jpeg',
      JPEG_QUALITY
    )
  })
}
