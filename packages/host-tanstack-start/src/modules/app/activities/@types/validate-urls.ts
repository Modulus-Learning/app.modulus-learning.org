function isAllowedPrefixUrl(value: string): boolean {
  const httpsUrlRegex = /^https:\/\/[^/\s]+\.[^/\s]+(\/[^\s]*)?$/
  const localhostHttpUrlRegex = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?(\/[\S]*)?$/

  return httpsUrlRegex.test(value) || localhostHttpUrlRegex.test(value)
}

export function validateUrlPrefix(value: string | null | undefined): {
  valid: boolean
  message: string
} {
  const normalizedValue = value?.trim() ?? ''
  if (normalizedValue === '') {
    return { valid: true, message: '' }
  }

  if (!isAllowedPrefixUrl(normalizedValue)) {
    return {
      valid: false,
      message:
        'Prefix must be a valid HTTPS URL, or an HTTP localhost/127.0.0.1 URL for local development.',
    }
  }

  return { valid: true, message: '' }
}

export function validateUrls(
  lines: string[] | null,
  urlPrefix?: string | null
): { valid: boolean; message: string } {
  if (lines == null || lines.length === 0) {
    return { valid: false, message: 'No URLs provided.' } // Allow empty or null input
  }

  // More permissive regex: https://, at least one dot, and something after the last dot
  const httpsUrlRegex = /^https:\/\/[^/\s]+\.[^/\s]+(\/[^\s]*)?$/

  // Local dev special-case: allow http://localhost or http://127.0.0.1 (optional port + path/query)
  const localhostHttpUrlRegex = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?(\/[\S]*)?$/

  const normalizedPrefix = urlPrefix?.trim() ?? ''
  const prefixValidation = validateUrlPrefix(normalizedPrefix)
  if (!prefixValidation.valid) {
    return prefixValidation
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '') continue // Allow empty lines

    const urlSchemeCount = (line.match(/\bhttps?:\/\//g) || []).length
    if (urlSchemeCount !== 1) {
      return { valid: false, message: `Line ${i + 1}: Cannot contain more than one URL per line.` }
    }

    const isLocalhostUrl = localhostHttpUrlRegex.test(line)
    if (!isLocalhostUrl) {
      if (!line.startsWith('https://')) {
        return {
          valid: false,
          message: `Line ${i + 1}: Must start with 'https://' (except http://localhost or http://127.0.0.1)`,
        }
      }
      if (!httpsUrlRegex.test(line)) {
        return {
          valid: false,
          message: `Line ${i + 1}: Must be a valid HTTPS URL with a hostname and domain ending`,
        }
      }
    }

    if (normalizedPrefix !== '' && !line.startsWith(normalizedPrefix)) {
      return {
        valid: false,
        message: `Line ${i + 1}: Must start with ${normalizedPrefix}`,
      }
    }
  }
  return { valid: true, message: '' }
}
