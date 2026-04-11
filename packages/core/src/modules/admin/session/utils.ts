import type { AdminUserRecord } from './repository/index.js'
import type { SignInResult } from './schemas.js'

export const toSignInResult = (
  adminUser: AdminUserRecord,
  adminAbilities: string[]
): SignInResult => {
  return {
    user: {
      id: adminUser.id,
      given_name: adminUser.given_name,
      family_name: adminUser.family_name,
      email: adminUser.email,
    },
    abilities: adminAbilities,
    provider: 'admin_session',
    remember_me: adminUser.remember_me,
  }
}
