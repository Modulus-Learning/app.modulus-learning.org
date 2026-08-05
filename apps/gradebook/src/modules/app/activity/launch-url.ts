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
