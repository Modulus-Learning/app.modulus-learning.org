import { getCoreInstance, getCoreUserRequestContext } from '@/core-adapter'
import type { ProgressResponse } from './@types'

// TODO: consider a response object with status and message
// so that we can communicate more than 'noFound' in the UI.
const notOkayResponse = {
  progress: [],
  included: {
    activity_code: null,
  },
  meta: {
    total: 0,
    page: 0,
    page_size: 10,
    total_pages: 0,
    query: '',
    order: 'created_at',
    desc: true,
  },
}

export async function getProgress(
  private_code: string,
  searchParams: {
    page?: string
    page_size?: string
    query?: string
    order?: string
    desc?: string
  } = {}
): Promise<ProgressResponse> {
  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    // TODO: How to handle?
    throw new Error('Unauthenticated')
  }

  const core = await getCoreInstance()
  const options = core.app.activities.getActivityProgress.schemas.input.safeParse({
    private_code,
    options: {
      page: searchParams.page,
      page_size: searchParams.page_size,
      query: searchParams.query,
      order: searchParams.order,
      desc: searchParams.desc,
    },
  })
  if (!options.success) {
    throw new Error('OOPS')
  }

  const result = await core.app.activities.getActivityProgress(userAuth, options.data)
  if (result.ok) {
    return result.data
  }

  return notOkayResponse
}
