'use server'

import { redirect } from 'next/navigation'

import { getCoreCommands, getCoreUserRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'
import { readUrlLines, validateUrlPrefix, validateUrls } from './@types/validate-urls'
import { mapActivityCodeFailure } from './rejected-urls'
import type { ActivityCodeFormState } from './@types'

export const createActivityCode = async (
  _prevState: ActivityCodeFormState,
  formData: FormData
): Promise<ActivityCodeFormState> => {
  const logger = getLogger()

  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    // TODO: Better way to handle this?  Throw an error?
    return {
      errors: {},
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  const activity_code = formData.get('activity_code') as string | null
  const urls = formData.get('urls') as string | null
  const urlPrefix = formData.get('url_prefix') as string | null
  const description = formData.get('description') as string | null

  if (activity_code == null || typeof activity_code !== 'string') {
    return {
      errors: {},
      message: 'Invalid activity code.',
      status: 'failed',
    }
  }

  if (urls != null && typeof urls !== 'string') {
    return {
      errors: { urls: ['URLs must be a string.'] },
      message: 'Invalid URLs.',
      status: 'failed',
    }
  }

  if (urlPrefix != null && typeof urlPrefix !== 'string') {
    return {
      errors: { url_prefix: ['URL prefix must be a string.'] },
      message: 'Invalid URL prefix.',
      status: 'failed',
    }
  }

  if (description != null && typeof description !== 'string') {
    return {
      errors: { description: ['Description must be a string.'] },
      message: 'Invalid description.',
      status: 'failed',
    }
  }

  const normalizedDescription = description?.trim() ?? ''
  if (normalizedDescription.length > 1024) {
    return {
      errors: { description: ['Description must be 1024 characters or fewer.'] },
      message: 'Invalid description.',
      status: 'failed',
    }
  }

  const normalizedUrlPrefix = urlPrefix?.trim() ?? ''
  const prefixValidationResult = validateUrlPrefix(normalizedUrlPrefix)
  if (prefixValidationResult.valid === false) {
    return {
      errors: { url_prefix: [prefixValidationResult.message] },
      message: 'Invalid URL prefix.',
      status: 'failed',
    }
  }

  // Validated line by line before blank lines are dropped, so each message
  // names the line the instructor sees. The same mapping translates core's
  // command-array indexes and submitted spellings back to those lines.
  const submitted = readUrlLines(urls)
  if (submitted.urls.length > 0) {
    const urlValidationResult = validateUrls((urls ?? '').split('\n'), normalizedUrlPrefix)
    if (urlValidationResult.valid === false) {
      return {
        errors: { urls: [urlValidationResult.message] },
        message: 'Invalid URLs.',
        status: 'failed',
      }
    }
  }

  const core = await getCoreCommands()
  const result = await core.app.activities.createActivityCode(userAuth, {
    code: activity_code,
    url_prefix: normalizedUrlPrefix === '' ? null : normalizedUrlPrefix,
    description: normalizedDescription === '' ? null : normalizedDescription,
    urls: submitted.urls,
  })

  if (!result.ok) {
    const failure = mapActivityCodeFailure(result.error, submitted)
    if (failure?.type === 'fields') {
      return { errors: failure.errors, message: failure.message, status: 'failed' }
    }

    if (failure?.type === 'unreadable-denial') {
      // A contract mismatch with core, so it is logged -- but by code alone:
      // `details` may still carry submitted URLs.
      logger.error({
        activities: {
          status: 'failed',
          message: 'unreadable activity url denial in createActivityCode',
          method: 'createActivityCode',
          code: result.error.code,
        },
      })
      return {
        errors: {},
        message: 'There was an error submitting your activity code.',
        status: 'failed',
      }
    }

    logger.error({
      activities: {
        status: 'failed',
        message: 'error in createActivityCode',
        method: 'createActivityCode',
        error: result.error,
      },
    })
    return {
      errors: {},
      message: 'There was an error submitting your activity code.',
      status: 'failed',
    }
  }

  redirect('/dashboard')
}
