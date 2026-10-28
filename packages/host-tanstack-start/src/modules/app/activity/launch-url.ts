export type ActivityLaunchParameters = {
  activityCode: string | null
  destinationURL: string | null
}

const missingActivityLaunchParameters = (): ActivityLaunchParameters => ({
  activityCode: null,
  destinationURL: null,
})

export const extractActivityLaunchParameters = (
  routeSegments: string[]
): ActivityLaunchParameters => {
  const [activityCode, rawScheme, ...rawRemainder] = routeSegments
  if (activityCode == null) {
    return missingActivityLaunchParameters()
  }
  if (rawScheme == null) {
    return { activityCode, destinationURL: null }
  }

  let scheme: string
  try {
    scheme = decodeURIComponent(rawScheme)
  } catch {
    return { activityCode, destinationURL: null }
  }

  if (!/^https?:$/i.test(scheme)) {
    return { activityCode, destinationURL: null }
  }

  // Next normalizes the nested URL's `//` to `/`, but direct route inputs may
  // retain an empty segment. Accept either shape before reading the authority.
  const remainder = rawRemainder[0] === '' ? rawRemainder.slice(1) : rawRemainder
  const [rawAuthority, ...pathSegments] = remainder
  if (rawAuthority == null || rawAuthority.length === 0) {
    return { activityCode, destinationURL: null }
  }

  let authority: string
  try {
    // App Router params encode URL syntax such as a port colon. Decode only the
    // authority; path escapes are authored content and must remain unchanged.
    authority = decodeURIComponent(rawAuthority)
  } catch {
    return { activityCode, destinationURL: null }
  }

  const path = pathSegments.length === 0 ? '' : `/${pathSegments.join('/')}`
  return {
    activityCode,
    destinationURL: `${scheme}//${authority}${path}`,
  }
}

export const buildActivityLaunchUrl = ({
  activityUrl,
  modulusServerUrl,
  scopeId,
}: {
  activityUrl: string
  modulusServerUrl: string
  scopeId: string
}): string => {
  const destination = new URL(activityUrl)
  destination.searchParams.set('modulus', modulusServerUrl)
  destination.searchParams.set('scope_id', scopeId)
  return destination.toString()
}
