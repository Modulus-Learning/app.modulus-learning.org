import { expect, test } from 'vitest'

import { decode, encode } from './encryption-jose'

test('should encrypt decrypt plaintext', async () => {
  const secret = 'some-really-good-secret'
  const user = { email: 'john@example.com', name: 'John' }
  const encrypted = await encode({ secret, salt: 'fdsrewrew', token: user })
  const decrypted = await decode({ secret, salt: 'fdsrewrew', token: encrypted })
  console.log(encrypted)
  console.log(decrypted)
  expect(decrypted?.email).toEqual(user.email)
})
