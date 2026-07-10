// The agent's public API: a factory and the instance type it returns.  The
// implementation class (ModulusAgentImpl) and its injectable collaborators are
// intentionally not re-exported, so the test-only construction seam is not part
// of the package's public surface.
export { createModulusAgent, type ModulusAgent } from './agent.js'
export * from './logger.js'
export type * from './types.js'
