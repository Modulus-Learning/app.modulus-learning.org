import { type RegisteredServices, Registry } from '@/lib/registry.js'
import { AdminAccountCommands } from './account/commands.js'
import { AdminAccountMutations, AdminAccountQueries } from './account/repository/index.js'
import { AdminAccountService } from './account/services/admin-account.js'
import { AdminRoleCommands } from './admin-roles/commands.js'
import { AdminRoleMutations, AdminRoleQueries } from './admin-roles/repository/index.js'
import { AdminRoleService } from './admin-roles/services/admin-roles.js'
import { AdminUserCommands } from './admin-users/commands.js'
import { AdminUserMutations, AdminUserQueries } from './admin-users/repository/index.js'
import { AdminUserService } from './admin-users/services/admin-users.js'
import { LtiPlatformsCommands } from './lti-platforms/commands.js'
import { LtiPlatformMutations, LtiPlatformQueries } from './lti-platforms/repository.js'
import { LtiPlatformsService } from './lti-platforms/services/lti-platforms.js'
import { AdminReportCommands } from './reports/commands.js'
import { AdminReportQueries } from './reports/repository/index.js'
import { AdminReportService } from './reports/services/admin-reports.js'
import { RoleCommands } from './roles/commands.js'
import { RoleMutations, RoleQueries } from './roles/repository/index.js'
import { RoleService } from './roles/services/roles.js'
import { AdminSessionCommands } from './session/commands.js'
import { AdminSessionMutations, AdminSessionQueries } from './session/repository/index.js'
import { AdminPasswordSignInService } from './session/services/password-sign-in.js'
import { AdminTokenIssuer } from './session/services/token-issuer.js'
import { AdminTokenRefreshService } from './session/services/token-refresh.js'
import { AdminTokenVerifier } from './session/services/token-verifier.js'
import { UserCommands } from './users/commands.js'
import { UserMutations, UserQueries } from './users/repository/index.js'
import { UserService } from './users/services/users.js'

const createAccountRegistry = () =>
  new Registry()
    .addClass('queries', AdminAccountQueries)
    .addClass('mutations', AdminAccountMutations)
    .addClass('service', AdminAccountService)
    .addClass('commands', AdminAccountCommands)

const createAdminRoleRegistry = () =>
  new Registry()
    .addClass('queries', AdminRoleQueries)
    .addClass('mutations', AdminRoleMutations)
    .addClass('service', AdminRoleService)
    .addClass('commands', AdminRoleCommands)

const createAdminUserRegistry = () =>
  new Registry()
    .addClass('queries', AdminUserQueries)
    .addClass('mutations', AdminUserMutations)
    .addClass('service', AdminUserService)
    .addClass('commands', AdminUserCommands)

const createAdminReportRegistry = () =>
  new Registry()
    .addClass('queries', AdminReportQueries)
    .addClass('service', AdminReportService)
    .addClass('commands', AdminReportCommands)

const createRoleRegistry = () =>
  new Registry()
    .addClass('queries', RoleQueries)
    .addClass('mutations', RoleMutations)
    .addClass('service', RoleService)
    .addClass('commands', RoleCommands)

const createUserRegistry = () =>
  new Registry()
    .addClass('queries', UserQueries)
    .addClass('mutations', UserMutations)
    .addClass('service', UserService)
    .addClass('commands', UserCommands)

const createAdminSessionRegistry = () =>
  new Registry()
    .addClass('tokenIssuer', AdminTokenIssuer)
    .addClass('tokenVerifier', AdminTokenVerifier)
    .addClass('queries', AdminSessionQueries)
    .addClass('mutations', AdminSessionMutations)
    .addClass('tokenRefreshService', AdminTokenRefreshService)
    .addClass('passwordSignInService', AdminPasswordSignInService)
    .addClass('commands', AdminSessionCommands)

const createLtiPlatformRegistry = () =>
  new Registry()
    .addClass('queries', LtiPlatformQueries)
    .addClass('mutations', LtiPlatformMutations)
    .addClass('service', LtiPlatformsService)
    .addClass('commands', LtiPlatformsCommands)

export const createAdminRegistry = () =>
  new Registry()
    .addNested('account', createAccountRegistry())
    .addNested('adminRoles', createAdminRoleRegistry())
    .addNested('adminUsers', createAdminUserRegistry())
    .addNested('reports', createAdminReportRegistry())
    .addNested('roles', createRoleRegistry())
    .addNested('users', createUserRegistry())
    .addNested('session', createAdminSessionRegistry())
    .addNested('ltiPlatforms', createLtiPlatformRegistry())

type AdminRegistry = ReturnType<typeof createAdminRegistry>

export const getAdminCommands = (services: RegisteredServices<AdminRegistry>) => {
  return {
    account: services.account.commands,
    adminRoles: services.adminRoles.commands,
    adminUsers: services.adminUsers.commands,
    reports: services.reports.commands,
    roles: services.roles.commands,
    users: services.users.commands,
    session: services.session.commands,
    ltiPlatforms: services.ltiPlatforms.commands,
  }
}
