// import type { NextFetchEvent, NextRequest } from 'next/server'

// import { decryptObject, encryptObject } from '@infonomic/crypto'

// import { getServerConfig } from '@/config'
// import type { MiddlewareFactory } from './@types'

// export const withTest: MiddlewareFactory = (next) => {
//   return async (request: NextRequest, event: NextFetchEvent) => {
//     const secret = getServerConfig().sessionSecret
//     const pathname = request.nextUrl.pathname
//     console.log('Secret key from process.env.SESSION_SECRET', secret)
//     const encrypted = await encryptObject({ hello: 'world' }, secret)
//     const decrypted = await decryptObject(encrypted, secret)
//     console.log('encrypted', encrypted)
//     console.log('de-encrypted', decrypted)

//     return next(request, event)
//   }
// }
