'use client'

import {
  Alert,
  Badge,
  Container,
  IconButton,
  PlusIcon,
  Section,
  Table,
} from '@infonomic/uikit/react'

import { LangLink } from '@/i18n/components/lang-link'
import { formatDateTime } from '@/utils/utils.general'
import { AllowAllEmptyState } from './copy'
import type { Locale } from '@/i18n/i18n-config'
import type { AllowlistRulesResponse } from '../@types'

export function AllowlistRulesListView({
  data,
  lng,
}: {
  data: AllowlistRulesResponse
  lng: Locale
}): React.JSX.Element {
  if (data.status === 'failed') {
    return (
      <Section>
        <Container>
          <h1>Activity URL Allowlist</h1>
          <Alert intent="danger">{data.message}</Alert>
        </Container>
      </Section>
    )
  }

  const { rules } = data

  return (
    <Section>
      <Container>
        <div className="flex items-center gap-3 py-[2px]">
          <h1 className="!m-0 pb-[2px]">Activity URL Allowlist</h1>
          <IconButton
            aria-label="Add allowlist rule"
            className="ml-auto"
            render={<LangLink href="/admin/activities/add" lng={lng} />}
          >
            <PlusIcon height="18px" width="18px" svgClassName="stroke-white dark:stroke-black" />
          </IconButton>
        </div>

        <p className="mt-2 max-w-[70ch]">
          These rules decide which activity URLs Modulus will register when it meets them for the
          first time. They never affect an activity Modulus has already accepted.
        </p>

        {!rules.some((rule) => rule.is_enabled) && (
          <AllowAllEmptyState allDisabled={rules.length > 0} />
        )}

        {rules.length > 0 && (
          <Table.Container className="mt-2 mb-3">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeadingCell scope="col" className="text-left w-[40%]">
                    Base URL
                  </Table.HeadingCell>
                  <Table.HeadingCell scope="col" className="text-left w-[12%]">
                    Status
                  </Table.HeadingCell>
                  <Table.HeadingCell scope="col" className="text-left w-[30%]">
                    Description
                  </Table.HeadingCell>
                  <Table.HeadingCell scope="col" className="text-right w-[18%]">
                    Created
                  </Table.HeadingCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rules.map((rule) => (
                  <Table.Row key={rule.id}>
                    <Table.Cell>
                      <LangLink href={`/admin/activities/${rule.id}/edit`} lng={lng}>
                        <span className="font-mono">{rule.base_url}</span>
                      </LangLink>
                    </Table.Cell>
                    <Table.Cell>
                      {rule.is_enabled ? (
                        <Badge intent="success">Enabled</Badge>
                      ) : (
                        <Badge intent="noeffect">Disabled</Badge>
                      )}
                    </Table.Cell>
                    <Table.Cell>{rule.description}</Table.Cell>
                    <Table.Cell className="text-right">
                      {formatDateTime(rule.created_at)}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </Table.Container>
        )}
      </Container>
    </Section>
  )
}
