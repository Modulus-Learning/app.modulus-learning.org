import * as crypto from 'node:crypto'

const iterations = 4096
const keylen = 32
const randomDataSize = 16
const format = 'base64'

// Encrypt. Invisible try..catch around this executor will reject.
// TODO: Think about error class and explicit reject reasons.
export const encrypt = (secretKey: string, plaintext: string) => {
  return new Promise<string>((resolve, reject) => {
    try {
      const iv = crypto.randomBytes(randomDataSize)
      const salt = crypto.randomBytes(randomDataSize).toString(format)
      const keyBuffer = crypto.pbkdf2Sync(secretKey, salt, iterations, keylen, 'sha512')
      const cipher = crypto.createCipheriv('aes-256-cfb', keyBuffer, iv)
      let encrypted = cipher.update(plaintext, 'utf8', format)
      encrypted += cipher.final(format)
      resolve(`${iv.toString(format)}:${salt}:${encrypted}`)
    } catch (error) {
      reject(error)
    }
  })
}

// Encrypt synchronously
export const encryptSync = (secretKey: string, plaintext: string) => {
  const iv = crypto.randomBytes(randomDataSize)
  const salt = crypto.randomBytes(randomDataSize).toString(format)
  const keyBuffer = crypto.pbkdf2Sync(secretKey, salt, iterations, keylen, 'sha512')
  const cipher = crypto.createCipheriv('aes-256-cfb', keyBuffer, iv)
  let encrypted = cipher.update(plaintext, 'utf8', format)
  encrypted += cipher.final(format)
  return `${iv.toString(format)}:${salt}:${encrypted}`
}

// Decrypt. Invisible try..catch around this executor will reject.
// TODO: Think about error class and explicit reject reasons.
export const decrypt = (secretKey: string, ciphertext: string) => {
  return new Promise((resolve, reject) => {
    try {
      // eslint-disable-next-line prefer-const
      const [iv, salt, secret] = ciphertext.split(':')
      const ivBuiffer = Buffer.from(iv, format)
      const keyBuffer = crypto.pbkdf2Sync(secretKey, salt, iterations, keylen, 'sha512')
      const decipher = crypto.createDecipheriv('aes-256-cfb', keyBuffer, ivBuiffer)
      // @ts-expect-error
      let decrypted = decipher.update(secret, format) as string
      decrypted += decipher.final(format)
      resolve(decrypted)
    } catch (error) {
      reject(error)
    }
  })
}

// De-encrypt synchronously
export const decryptSync = (secretKey: string, ciphertext: string) => {
  // eslint-disable-next-line prefer-const
  const [iv, salt, secret] = ciphertext.split(':')
  const ivBuffer = Buffer.from(iv, format)
  const keyBuffer = crypto.pbkdf2Sync(secretKey, salt, iterations, keylen, 'sha512')
  const decipher = crypto.createDecipheriv('aes-256-cfb', keyBuffer, ivBuffer)
  // @ts-expect-error
  let decrypted = decipher.update(secret, format) as string
  decrypted += decipher.final(format)
  return decrypted
}
