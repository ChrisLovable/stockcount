export type VisionPrepMode = 'fast' | 'deep' | 'default'

export interface PrepareForVisionOptions {
  mode?: VisionPrepMode
  maxWidth?: number
  jpegQuality?: number
}

export interface ImagePrepLog {
  original_size_kb: number
  compressed_size_kb: number
  width_before: number
  height_before: number
  width_after: number
  height_after: number
}

export interface PreparedVisionImage {
  base64: string
  mimeType: 'image/jpeg' | 'image/png'
  width: number
  height: number
  originalSizeKb: number
  compressedSizeKb: number
  widthBefore: number
  heightBefore: number
  log: ImagePrepLog
  /** Raw bytes before compression — server-side only, for audit storage */
  originalBuffer?: Buffer
}

export interface ResolvedVisionPrepOptions {
  maxWidth: number
  jpegQuality: number
  mode: VisionPrepMode
}

const MODE_PRESETS: Record<'fast' | 'deep', { maxWidth: number; jpegQuality: number }> = {
  fast: { maxWidth: 1024, jpegQuality: 0.7 },
  deep: { maxWidth: 1280, jpegQuality: 0.8 },
}

function envInt(name: string, fallback: number): number {
  if (typeof process === 'undefined') return fallback
  const value = process.env[name]
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function envFloat(name: string, fallback: number): number {
  if (typeof process === 'undefined') return fallback
  const value = process.env[name]
  if (!value) return fallback
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function resolveVisionPrepOptions(
  options?: PrepareForVisionOptions,
): ResolvedVisionPrepOptions {
  const mode = options?.mode ?? 'default'

  if (mode === 'fast') {
    return { mode, ...MODE_PRESETS.fast }
  }
  if (mode === 'deep') {
    return { mode, ...MODE_PRESETS.deep }
  }

  return {
    mode: 'default',
    maxWidth: options?.maxWidth ?? envInt('IMAGE_MAX_WIDTH', 1280),
    jpegQuality: options?.jpegQuality ?? envFloat('IMAGE_JPEG_QUALITY', 0.75),
  }
}

function bytesToKb(bytes: number): number {
  return Math.round((bytes / 1024) * 10) / 10
}

function stripDataUrlPrefix(data: string): string {
  return data.replace(/^data:image\/\w+;base64,/, '')
}

function buildLog(
  originalBytes: number,
  compressedBytes: number,
  widthBefore: number,
  heightBefore: number,
  widthAfter: number,
  heightAfter: number,
): ImagePrepLog {
  return {
    original_size_kb: bytesToKb(originalBytes),
    compressed_size_kb: bytesToKb(compressedBytes),
    width_before: widthBefore,
    height_before: heightBefore,
    width_after: widthAfter,
    height_after: heightAfter,
  }
}

export function logImagePrep(log: ImagePrepLog, context?: string): void {
  const prefix = context ? `[prepareForVision:${context}]` : '[prepareForVision]'
  console.log(prefix, JSON.stringify(log))
}

function buildResult(
  base64: string,
  mimeType: 'image/jpeg' | 'image/png',
  widthAfter: number,
  heightAfter: number,
  originalBytes: number,
  compressedBytes: number,
  widthBefore: number,
  heightBefore: number,
  originalBuffer?: Buffer,
): PreparedVisionImage {
  const log = buildLog(originalBytes, compressedBytes, widthBefore, heightBefore, widthAfter, heightAfter)
  logImagePrep(log)

  return {
    base64,
    mimeType,
    width: widthAfter,
    height: heightAfter,
    originalSizeKb: log.original_size_kb,
    compressedSizeKb: log.compressed_size_kb,
    widthBefore,
    heightBefore,
    log,
    originalBuffer,
  }
}

async function inputToBuffer(input: File | string | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(input)) return input
  if (typeof input === 'string') {
    return Buffer.from(stripDataUrlPrefix(input), 'base64')
  }
  const arrayBuffer = await input.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

async function prepareImageForVisionServer(
  input: File | string | Buffer,
  options?: PrepareForVisionOptions,
): Promise<PreparedVisionImage> {
  const sharp = (await import('sharp')).default
  const resolved = resolveVisionPrepOptions(options)
  const originalBuffer = await inputToBuffer(input)
  const originalBytes = originalBuffer.length

  const meta = await sharp(originalBuffer).metadata()
  const widthBefore = meta.width ?? 0
  const heightBefore = meta.height ?? 0
  const hasAlpha = Boolean(meta.hasAlpha)

  let pipeline = sharp(originalBuffer).rotate()

  if (widthBefore > resolved.maxWidth) {
    pipeline = pipeline.resize({ width: resolved.maxWidth, withoutEnlargement: true })
  }

  let outputBuffer: Buffer
  let mimeType: 'image/jpeg' | 'image/png'

  if (hasAlpha) {
    outputBuffer = await pipeline.png({ compressionLevel: 9 }).toBuffer()
    mimeType = 'image/png'
  } else {
    outputBuffer = await pipeline
      .jpeg({ quality: Math.round(resolved.jpegQuality * 100), mozjpeg: true })
      .toBuffer()
    mimeType = 'image/jpeg'
  }

  const outMeta = await sharp(outputBuffer).metadata()

  return buildResult(
    outputBuffer.toString('base64'),
    mimeType,
    outMeta.width ?? widthBefore,
    outMeta.height ?? heightBefore,
    originalBytes,
    outputBuffer.length,
    widthBefore,
    heightBefore,
    originalBuffer,
  )
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

async function inputToDataUrl(input: File | string): Promise<{ dataUrl: string; originalBytes: number }> {
  if (typeof input === 'string') {
    const base64 = stripDataUrlPrefix(input)
    const bytes = Math.ceil((base64.length * 3) / 4)
    const prefix = input.startsWith('data:') ? '' : 'data:image/jpeg;base64,'
    return { dataUrl: input.startsWith('data:') ? input : `${prefix}${base64}`, originalBytes: bytes }
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const base64 = stripDataUrlPrefix(dataUrl)
      resolve({ dataUrl, originalBytes: Math.ceil((base64.length * 3) / 4) })
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(input)
  })
}

function canvasHasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const sample = ctx.getImageData(0, 0, Math.min(w, 64), Math.min(h, 64)).data
  for (let i = 3; i < sample.length; i += 4) {
    if (sample[i] < 255) return true
  }
  return false
}

async function prepareImageForVisionClient(
  input: File | string,
  options?: PrepareForVisionOptions,
): Promise<PreparedVisionImage> {
  const resolved = resolveVisionPrepOptions(options)
  const { dataUrl, originalBytes } = await inputToDataUrl(input)
  const img = await loadImageElement(dataUrl)

  const widthBefore = img.naturalWidth
  const heightBefore = img.naturalHeight
  const scale = widthBefore > resolved.maxWidth ? resolved.maxWidth / widthBefore : 1
  const widthAfter = Math.round(widthBefore * scale)
  const heightAfter = Math.round(heightBefore * scale)

  const canvas = document.createElement('canvas')
  canvas.width = widthAfter
  canvas.height = heightAfter
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not available')

  ctx.drawImage(img, 0, 0, widthAfter, heightAfter)
  const needsPng = canvasHasTransparency(ctx, widthAfter, heightAfter)

  const mimeType: 'image/jpeg' | 'image/png' = needsPng ? 'image/png' : 'image/jpeg'
  const quality = needsPng ? undefined : resolved.jpegQuality

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('Failed to compress image'))),
      mimeType,
      quality,
    )
  })

  const compressedBytes = blob.size
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(stripDataUrlPrefix(reader.result as string))
    reader.onerror = () => reject(new Error('Failed to encode image'))
    reader.readAsDataURL(blob)
  })

  return buildResult(
    base64,
    mimeType,
    widthAfter,
    heightAfter,
    originalBytes,
    compressedBytes,
    widthBefore,
    heightBefore,
  )
}

/**
 * Resize and compress an image before sending to vision APIs.
 * Uses sharp on the server and canvas in the browser.
 */
export async function prepareImageForVision(
  input: File | string | Buffer,
  options?: PrepareForVisionOptions,
): Promise<PreparedVisionImage> {
  if (typeof window === 'undefined') {
    return prepareImageForVisionServer(input, options)
  }
  if (Buffer.isBuffer(input)) {
    throw new Error('Buffer input is only supported on the server')
  }
  return prepareImageForVisionClient(input, options)
}
