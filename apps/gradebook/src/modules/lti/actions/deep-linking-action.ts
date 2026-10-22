'use server'

import { getCoreCommands, getCoreUserRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'
import { runDeepLinking } from './deep-linking.logic'
import type { DeepLinkingFormState } from '../@types'

export const deepLinking = async (
  _prevState: DeepLinkingFormState,
  formData: FormData
): Promise<DeepLinkingFormState> =>
  runDeepLinking({
    core: await getCoreCommands(),
    ctx: await getCoreUserRequestContext(),
    log: getLogger(),
    formData,
  })
