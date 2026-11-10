/**
 * Core's `DEFAULT_SCOPE_ID` sentinel (`packages/core/src/database/schema/constants.ts`),
 * restated here so that browser code — route files — need not import
 * `@modulus-learning/core`, which would pull core's server dependencies into
 * the client graph. `default-scope.test.node.ts` keeps the two equal.
 */
export const DEFAULT_SCOPE_ID = '00000000-0000-0000-0000-000000000000' as const
