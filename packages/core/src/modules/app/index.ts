import { type RegisteredServices, Registry } from '@/lib/registry.js'
import { AccountCommands } from './account/commands.js'
import { AccountMutations, AccountQueries } from './account/repository/index.js'
import { AccountService } from './account/services/account.js'
import { ActivityCommands } from './activities/commands.js'
import { ActivityMutations, ActivityQueries } from './activities/repository/index.js'
import { ActivityService } from './activities/services/activity.js'
import { StartActivityService } from './activities/services/start-activity.js'
import { LtiCommands } from './lti/commands.js'
import { LtiMutations, LtiQueries } from './lti/repository/index.js'
import { AccessTokenManager } from './lti/services/access-tokens.js'
import { LtiDeepLinkingService } from './lti/services/deep-link.js'
import { LtiLaunchService } from './lti/services/launch.js'
import { LtiLoginService } from './lti/services/login.js'
import { ScoreSubmissionProcessor } from './lti/services/score-submission.js'
import { RegistrationCommands } from './registration/commands.js'
import { RegistrationMutations, RegistrationQueries } from './registration/repository/index.js'
import { RegistrationService } from './registration/services/registration.js'
import { UserSessionCommands } from './session/commands.js'
import { SessionMutations, SessionQueries } from './session/repository/index.js'
import { GithubSignInService } from './session/services/github-oauth.js'
import { GoogleSignInService } from './session/services/google-oauth.js'
import { LtiSignInService } from './session/services/lti-sign-in.js'
import { PasswordSignInService } from './session/services/password-sign-in.js'
import { TokenIssuer } from './session/services/token-issuer.js'
import { TokenRefreshService } from './session/services/token-refresh.js'
import { TokenVerifier } from './session/services/token-verifier.js'

const createAccountRegistry = () =>
  new Registry()
    .addClass('queries', AccountQueries)
    .addClass('mutations', AccountMutations)
    .addClass('service', AccountService)
    .addClass('commands', AccountCommands)

const createActivityRegistry = () =>
  new Registry()
    .addClass('queries', ActivityQueries)
    .addClass('mutations', ActivityMutations)
    .addClass('service', ActivityService)
    .addClass('startService', StartActivityService)
    .addClass('commands', ActivityCommands)

const createSessionRegistry = () =>
  new Registry()
    .addClass('tokenIssuer', TokenIssuer)
    .addClass('tokenVerifier', TokenVerifier)
    .addClass('queries', SessionQueries)
    .addClass('mutations', SessionMutations)
    .addClass('tokenRefreshService', TokenRefreshService)
    .addClass('githubSignInService', GithubSignInService)
    .addClass('googleSignInService', GoogleSignInService)
    .addClass('passwordSignInService', PasswordSignInService)
    .addClass('ltiSignInService', LtiSignInService)
    .addClass('commands', UserSessionCommands)

const createRegistrationRegistry = () =>
  new Registry()
    .addClass('queries', RegistrationQueries)
    .addClass('mutations', RegistrationMutations)
    .addClass('service', RegistrationService)
    .addClass('commands', RegistrationCommands)

const createLtiRegistry = () =>
  new Registry()
    .addClass('queries', LtiQueries)
    .addClass('mutations', LtiMutations)
    .addClass('accessTokenManager', AccessTokenManager)
    .addClass('scoreSubmissionProcessor', ScoreSubmissionProcessor)
    .addClass('loginService', LtiLoginService)
    .addClass('launchService', LtiLaunchService)
    .addClass('deepLinkingService', LtiDeepLinkingService)
    .addClass('commands', LtiCommands)

export const createAppRegistry = () =>
  new Registry()
    .addNested('account', createAccountRegistry())
    .addNested('activities', createActivityRegistry())
    .addNested('session', createSessionRegistry())
    .addNested('registration', createRegistrationRegistry())
    .addNested('lti', createLtiRegistry())

type AppRegistry = ReturnType<typeof createAppRegistry>

export const getAppCommands = (services: RegisteredServices<AppRegistry>) => {
  return {
    account: services.account.commands,
    activities: services.activities.commands,
    session: services.session.commands,
    registration: services.registration.commands,
    lti: services.lti.commands,
  }
}

