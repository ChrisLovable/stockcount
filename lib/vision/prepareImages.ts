import {
  prepareImageForVision,
  type ImagePrepLog,
  type VisionPrepMode,
} from '@/lib/images/prepareForVision'

export interface PreparedImage {
  base64: string
  mediaType: 'image/jpeg' | 'image/png'
  index: number
  width: number
  height: number
  prepLog: ImagePrepLog
  originalBuffer?: Buffer
}

function envInt(name: string, fallback: number): number {
  const value = process.env[name]
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function defaultVisionMode(burstMode: boolean): VisionPrepMode {
  return burstMode ? 'fast' : 'deep'
}

export async function prepareImages(
  rawImages: string[],
  mode?: VisionPrepMode,
): Promise<PreparedImage[]> {
  const maxImages = envInt('BURST_MAX_IMAGES', 10)
  const limited = rawImages.slice(0, maxImages)

  return Promise.all(
    limited.map(async (img, i) => {
      const prepared = await prepareImageForVision(img, { mode })
      return {
        base64: prepared.base64,
        mediaType: prepared.mimeType,
        index: i + 1,
        width: prepared.width,
        height: prepared.height,
        prepLog: prepared.log,
        originalBuffer: prepared.originalBuffer,
      }
    }),
  )
}
