import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import { type UnlinkLtiState, unlinkLtiFormSchema } from './@types'

/**
 * Clears a learner's LTI identity through core, which enforces `users:edit`
 * and applies the write only while the version and identity still match what
 * the page showed.
 */
export async function unlinkUserLtiIdentity(
  _prevState: UnlinkLtiState,
  formData: FormData
): Promise<UnlinkLtiState> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return { status: 'failed', message: 'Not logged in.' }
  }

  const parsed = unlinkLtiFormSchema.safeParse({
    id: formData.get('id'),
    vid: formData.get('vid'),
    lti_iss: formData.get('lti_iss') ?? '',
    lti_sub: formData.get('lti_sub') ?? '',
  })
  if (!parsed.success) {
    return { status: 'failed', message: 'Unable to unlink the LTI identity.' }
  }

  const core = await getCoreCommands()
  const result = await core.admin.users.unlinkUserLtiIdentity(adminAuth, parsed.data)

  if (result.ok) {
    return {
      status: 'success',
      message: result.data.changed
        ? 'LTI identity unlinked.'
        : 'This account was already unlinked.',
    }
  }

  switch (result.error.code) {
    case 'ERR_VERSION_CONFLICT':
      return {
        status: 'conflict',
        message: 'This account changed since the page was loaded. Refresh and try again.',
      }
    case 'ERR_FORBIDDEN':
      return { status: 'failed', message: 'You do not have permission to unlink LTI identities.' }
    default:
      return { status: 'failed', message: 'Unable to unlink the LTI identity.' }
  }
}
