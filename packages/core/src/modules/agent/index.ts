import { type RegisteredServices, Registry } from '@/lib/registry.js'
import { ActivityStateCommands } from './activity-state/commands.js'
import { ActivityStateMutations, ActivityStateQueries } from './activity-state/repository/index.js'
import { ActivityPageStateService } from './activity-state/services/pagestate.js'
import { ActivityProgressService } from './activity-state/services/progress.js'
import { AgentAuthCommands } from './auth/commands.js'
import { AgentAuthMutations, AgentAuthQueries } from './auth/repository/index.js'
import { AgentAuthService } from './auth/services/agent-auth.js'
import { AgentTokenIssuer } from './auth/services/token-issuer.js'
import { TokenRefreshService } from './auth/services/token-refresh.js'
import { AgentTokenVerifier } from './auth/services/token-verifier.js'

const createAuthRegistry = () =>
  new Registry()
    .addClass('queries', AgentAuthQueries)
    .addClass('mutations', AgentAuthMutations)
    .addClass('tokenIssuer', AgentTokenIssuer)
    .addClass('tokenVerifier', AgentTokenVerifier)
    .addClass('tokenRefresh', TokenRefreshService)
    .addClass('service', AgentAuthService)
    .addClass('commands', AgentAuthCommands)

const createActivityStateRegistry = () =>
  new Registry()
    .addClass('queries', ActivityStateQueries)
    .addClass('mutations', ActivityStateMutations)
    .addClass('progressService', ActivityProgressService)
    .addClass('pageStateService', ActivityPageStateService)
    .addClass('commands', ActivityStateCommands)

export const createAgentRegistry = () =>
  new Registry()
    .addNested('auth', createAuthRegistry())
    .addNested('activityState', createActivityStateRegistry())

type AgentServices = RegisteredServices<ReturnType<typeof createAgentRegistry>>

export const getAgentCommands = (services: AgentServices) => {
  return {
    auth: services.auth.commands,
    activityState: services.activityState.commands,
  }
}
