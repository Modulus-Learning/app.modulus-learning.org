export function hasErrors(name: string, clientErrors: any, serverErrors: any): boolean {
  return Boolean(serverErrors?.[name as keyof typeof serverErrors] ?? clientErrors[name])
}

export function hasAnyErrors(names: string[], clientErrors: any, serverErrors: any): boolean {
  return names.some((name) =>
    Boolean(serverErrors?.[name as keyof typeof serverErrors] ?? clientErrors[name])
  )
}

export function getErrorText(
  name: string,
  clientErrors: any | null,
  serverErrors: any | null
): string | undefined {
  // Check for client error first.
  if (clientErrors != null) {
    const message = clientErrors[name]?.message
    if (message != null) {
      return message
    }
  }

  // Check for server errors
  if (serverErrors != null) {
    const error =
      serverErrors != null
        ? (serverErrors[name as keyof typeof serverErrors] as string[])
        : undefined
    if (error != null && error.length > 0) {
      return error.join(' ')
    }
  }
}
