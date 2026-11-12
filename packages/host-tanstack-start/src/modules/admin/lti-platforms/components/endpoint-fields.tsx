import type { ReactNode } from 'react'

import { Input } from '@infonomic/uikit/react'
import type { FieldErrors, UseFormRegisterReturn } from 'react-hook-form'

import { getErrorText, hasErrors } from '@/utils/utils.forms'
import type { EndpointField } from '../@types'

const CANVAS_LAUNCH_OVERVIEW =
  'https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.lti_launch_overview'

const FIELDS: { name: EndpointField; label: string; helpText: string }[] = [
  {
    name: 'authorization_endpoint',
    label: 'Authorization Endpoint',
    helpText:
      "The platform's OIDC authorization endpoint, where logins are redirected. For hosted Canvas, the sso.canvaslms.com authorize_redirect URL.",
  },
  {
    name: 'token_endpoint',
    label: 'Token Endpoint',
    helpText: "The platform's OAuth 2 token endpoint, used to request grade passback tokens.",
  },
  {
    name: 'jwks_uri',
    label: 'JWKS URI',
    helpText: "The URL of the platform's public keys, used to verify launches.",
  },
  {
    name: 'authorization_server',
    label: 'Authorization Server',
    helpText:
      'The audience (aud) of token requests. Usually the token endpoint or the platform host.',
  },
]

interface EndpointFieldsProps {
  register: (name: EndpointField) => UseFormRegisterReturn
  errors: FieldErrors
  isValid: boolean
  /** Controls shown under the heading, such as the "Fill defaults" button. */
  children?: ReactNode
}

/**
 * The four registration endpoints, shared by the create and edit forms. Each
 * value is entered or confirmed by an administrator; the LMS adapter only
 * suggests defaults.
 */
export function EndpointFields({
  register,
  errors,
  isValid,
  children,
}: EndpointFieldsProps): React.JSX.Element {
  return (
    <fieldset className="mt-4 mb-2">
      <legend className="text-lg font-semibold mb-1">Endpoints</legend>
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
        Find these in your platform&apos;s LTI 1.3 documentation. For Canvas, see Instructure&apos;s{' '}
        <a href={CANVAS_LAUNCH_OVERVIEW} target="_blank" rel="noopener noreferrer">
          LTI launch overview
        </a>
        .
      </p>
      {children}
      {FIELDS.map(({ name, label, helpText }) => (
        <Input
          key={name}
          required
          id={name}
          label={label}
          placeHolder={label}
          helpText={helpText}
          error={!isValid && hasErrors(name, errors, null)}
          errorText={!isValid ? getErrorText(name, errors, null) : ''}
          {...register(name)}
        />
      ))}
    </fieldset>
  )
}
