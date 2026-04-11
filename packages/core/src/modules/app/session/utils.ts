import type { UserRecord } from './repository/index.js'
import type { SignInResult } from './schemas.js'

export const toSignInResult = (user: UserRecord, abilities: string[]): SignInResult => {
  return {
    user: {
      id: user.id,
      full_name: user.full_name ?? undefined,
    },
    abilities,
    remember_me: user.remember_me,
  }
}
