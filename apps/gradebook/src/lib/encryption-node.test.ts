import { expect, test } from 'vitest'

import { decryptSync, encryptSync } from './encryption-node'

test('should encrypt decrypt plaintext', () => {
  const text =
    'My secret is safe. And this is a longer piece of text here that will see how much longer the cipher text is.'
  const password = 'password'
  const cipherText = encryptSync(password, text)
  const plainText = decryptSync(password, cipherText)
  //n console.log(cipherText)
  expect(plainText).toEqual(text)
})
