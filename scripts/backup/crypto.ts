import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'

const magic = Buffer.from('STTBACKUP1')

export function readKey(value: string | undefined): Buffer {
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be 64 hexadecimal characters (32 random bytes).')
  }
  return Buffer.from(value, 'hex')
}

// Versioned header + random nonce + authentication tag + gzip-compressed ciphertext.
export function encrypt(sql: Buffer, key: Buffer): Buffer {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(magic)
  const data = Buffer.concat([cipher.update(gzipSync(sql)), cipher.final()])
  return Buffer.concat([magic, nonce, cipher.getAuthTag(), data])
}

export function decrypt(data: Buffer, key: Buffer): Buffer {
  const offset = magic.length
  if (data.length <= offset + 28 || !data.subarray(0, offset).equals(magic)) {
    throw new Error('Invalid backup format.')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(offset, offset + 12))
  decipher.setAAD(magic)
  decipher.setAuthTag(data.subarray(offset + 12, offset + 28))
  // Authenticate before returning or writing any plaintext.
  return gunzipSync(Buffer.concat([decipher.update(data.subarray(offset + 28)), decipher.final()]))
}
