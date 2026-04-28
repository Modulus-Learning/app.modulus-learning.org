'use client'

import { Button, CopyButton, Input } from '@infonomic/uikit/react'

import { LangLink } from '@/i18n/components/lang-link'
import type { Locale } from '@/i18n/i18n-config'
import type { LtiPlatformResponse } from '../@types'

interface LtiPlatformDetailsProps {
  lng: Locale
  data: LtiPlatformResponse
  mode: 'view'
}

export function LtiPlatformDetailsView({
  lng,
  data,
  mode: _mode,
}: LtiPlatformDetailsProps): React.JSX.Element {
  const platform = data.platform

  return (
    <div className="max-w-[500px] mx-auto rounded-md border border-gray-100 dark:border-gray-700 px-5 pb-1 mb-8 mt-[4vh]">
      <div className="py-3 mb-2 flex items-center justify-start">
        <h2 className="!m-0 !mr-auto">LTI Platform Details</h2>
        <CopyButton
          aria-label="Copy platform JSON to clipboard"
          size="xs"
          variant="outlined"
          intent="noeffect"
          text={platform != null ? JSON.stringify(platform, null, 2) : ''}
        />
      </div>
      <div className="input-control mb-2">
        <Input
          name="name"
          defaultValue={platform?.name}
          id="name"
          label="Name"
          readOnly={true}
        />
      </div>
      <div className="input-control mb-2">
        <Input
          name="issuer"
          defaultValue={platform?.issuer}
          id="issuer"
          label="Issuer"
          readOnly={true}
        />
      </div>
      <div className="input-control mb-2">
        <Input
          name="client_id"
          defaultValue={platform?.client_id}
          id="client_id"
          label="Client ID"
          readOnly={true}
        />
      </div>
      <div className="input-control mb-2">
        <Input
          name="deployment_id"
          defaultValue={platform?.deployment_id ?? undefined}
          id="deployment_id"
          label="Deployment ID"
          readOnly={true}
        />
      </div>
      <div className="input-control mb-2">
        <Input
          name="authorization_endpoint"
          defaultValue={platform?.authorization_endpoint}
          id="authorization_endpoint"
          label="Authorization Endpoint"
          readOnly={true}
        />
      </div>
      <div className="input-control mb-2">
        <Input
          name="token_endpoint"
          defaultValue={platform?.token_endpoint}
          id="token_endpoint"
          label="Token Endpoint"
          readOnly={true}
        />
      </div>
      <div className="input-control mb-2">
        <Input
          name="jwks_uri"
          defaultValue={platform?.jwks_uri}
          id="jwks_uri"
          label="JWKS URI"
          readOnly={true}
        />
      </div>
      <div className="input-control mb-2">
        <Input
          name="authorization_server"
          defaultValue={platform?.authorization_server}
          id="authorization_server"
          label="Authorization Server"
          readOnly={true}
        />
      </div>

      <div className="form-actions flex gap-2 justify-end my-4">
        <Button intent="noeffect" render={<LangLink href="/admin/lti-platforms" lng={lng} />}>
          Close
        </Button>
      </div>
    </div>
  )
}
