/**
 * Photo capture and local file storage.
 *
 * Bytes live in app-private storage (`Directory.Data`) so a captured photo is
 * visible immediately and never depends on the network. `local_path` in SQLite
 * is the path inside that directory; the sync adapter reads it back with
 * `readPhotoBytes` when the device is online.
 */

import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Directory, Filesystem } from '@capacitor/filesystem'

const PHOTO_ROOT = 'photos'
const SIGNED_URL_TTL_SECONDS = 60 * 60

export interface CapturedPhoto {
  /** `data:image/...;base64,…` payload returned by the camera plugin. */
  dataUrl: string
  format: string
}

function extensionFor(format: string): string {
  const normalized = format.toLowerCase()
  if (normalized === 'png') return 'png'
  if (normalized === 'gif') return 'gif'
  if (normalized === 'webp') return 'webp'
  return 'jpg'
}

/** Opens the camera/gallery prompt and returns a compressed data URL. */
export async function capturePhoto(): Promise<CapturedPhoto> {
  const photo = await Camera.getPhoto({
    quality: 80,
    width: 1600,
    correctOrientation: true,
    allowEditing: false,
    saveToGallery: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Prompt,
  })

  if (!photo.dataUrl) throw new Error('عکس گرفته شد اما داده‌ای دریافت نشد')
  return { dataUrl: photo.dataUrl, format: photo.format || 'jpeg' }
}

/** Writes the captured bytes to app-private storage and returns `local_path`. */
export async function savePhotoFile(
  dataUrl: string,
  userId: string,
  photoId: string,
  format: string
): Promise<string> {
  const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl
  const path = `${PHOTO_ROOT}/${userId}/${photoId}.${extensionFor(format)}`

  await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory.Data,
    recursive: true,
  })

  return path
}

/** Reads a local photo as a data URL for display or upload. */
export async function readPhotoDataUrl(localPath: string): Promise<string | null> {
  try {
    const result = await Filesystem.readFile({ path: localPath, directory: Directory.Data })
    const raw = typeof result.data === 'string' ? result.data : ''
    if (!raw) return null
    return raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`
  } catch {
    return null
  }
}

/** Reads a local photo as raw bytes (used by the Supabase storage adapter). */
export async function readPhotoBytes(localPath: string): Promise<Uint8Array | null> {
  const dataUrl = await readPhotoDataUrl(localPath)
  if (!dataUrl) return null
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export async function deletePhotoFile(localPath: string): Promise<void> {
  try {
    await Filesystem.deleteFile({ path: localPath, directory: Directory.Data })
  } catch {
    // The file may already be gone; the DB row is the source of truth.
  }
}

/** Removes every locally stored photo of one account during a local-data wipe. */
export async function deleteUserPhotoFiles(userId: string): Promise<void> {
  if (!userId) return
  try {
    await Filesystem.rmdir({
      path: `${PHOTO_ROOT}/${userId}`,
      directory: Directory.Data,
      recursive: true,
    })
  } catch {
    // Nothing was stored, or the platform has no filesystem (browser dev).
  }
}

export function photoContentType(localPath: string): string {
  const ext = localPath.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'png') return 'image/png'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

/** Storage object path: `${userId}/${customerId ?? 'unlinked'}/${photoId}.ext`. */
export function storagePathFor(
  userId: string,
  customerId: string | null,
  photoId: string,
  localPath: string
): string {
  const ext = localPath.split('.').pop() ?? 'jpg'
  return `${userId}/${customerId ?? 'unlinked'}/${photoId}.${ext}`
}

/** Resolves a remote-only photo; returns null when the signed URL cannot be made. */
export async function createPhotoSignedUrl(storagePath: string): Promise<string | null> {
  try {
    const { supabase } = await import('@services/supabase/client')
    const { data, error } = await supabase.storage
      .from('customer-photos')
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
    if (error || !data?.signedUrl) return null
    return data.signedUrl
  } catch {
    return null
  }
}
