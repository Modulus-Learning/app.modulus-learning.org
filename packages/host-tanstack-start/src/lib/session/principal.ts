/**
 * The expected login identity for replay safety (spec: Authentication And
 * Sessions, item 7). Core does not issue a per-login session id yet, so the
 * identity is the principal — the session domain plus the user id carried in
 * every access token. Isomorphic; holds no credential.
 */

export type SessionDomain = 'user' | 'admin'

export interface Principal {
  domain: SessionDomain
  userId: string
}

export const principalOf = (
  domain: SessionDomain,
  session: { user: { id: string } }
): Principal => ({
  domain,
  userId: session.user.id,
})

export const samePrincipal = (a: Principal | null | undefined, b: Principal | null | undefined) =>
  a != null && b != null && a.domain === b.domain && a.userId === b.userId
