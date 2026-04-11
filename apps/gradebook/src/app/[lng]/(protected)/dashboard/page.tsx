import { Button, Container, CopyButton, Section, Table } from '@infonomic/uikit/react'

import { getServerConfig } from '@/config'
import { LangLink } from '@/i18n/components/lang-link'
import { getActivityCodes } from '@/modules/app/activities/get-activity-codes'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export default async function ActivityList({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<React.JSX.Element> {
  const { lng } = await params
  const { activity_codes } = await getActivityCodes()
  const config = getServerConfig()

  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs lng={lng} breadcrumbs={[{ label: 'Activity Codes', href: '/dashboard' }]} />
        </Container>
      </Section>

      <Section>
        <Container className="sm:px-[32px] mb-8">
          <div className="flex justify-between items-center">
            <h1 className="mb-2">Activity Codes</h1>
            <Button
              size="sm"
              variant="outlined"
              render={<LangLink href="/dashboard/create-activity-code" />}
            >
              Create Activity Code
            </Button>
          </div>
          <p className="text-sm mb-4">
            Note: These are instructor-owned activity codes - shown for the currently signed in
            user.
          </p>
          <Table.Container>
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeadingCell scope="col" className="p-2 text-left min-w-[200px]">
                    Code
                  </Table.HeadingCell>
                  <Table.HeadingCell scope="col" className="p-2">
                    Admin Link
                  </Table.HeadingCell>
                </Table.Row>
              </Table.Header>

              <Table.Body>
                {activity_codes.map((activityCode) => {
                  const adminPath = `/dashboard/activity-code/${activityCode.private_code}`
                  const adminUrl = config.publicServerUrl + adminPath
                  return (
                    <Table.Row key={activityCode.private_code}>
                      <Table.Cell className="py-3">
                        <div className="flex items-center gap-2">
                          <CopyButton
                            className="w-[24px] min-w-[24px] h-[24px]"
                            svgClassName="w-[18px]"
                            variant="outlined"
                            size="xs"
                            intent="noeffect"
                            text={activityCode.code}
                          />
                          <LangLink className="pb-[3px]" href={adminPath}>
                            {activityCode.code}
                          </LangLink>
                        </div>
                      </Table.Cell>
                      <Table.Cell className="items-center gap-2">
                        <div className="flex items-center gap-2">
                          <CopyButton
                            className="w-[24px] min-w-[24px] h-[24px]"
                            svgClassName="w-[18px]"
                            variant="outlined"
                            size="xs"
                            intent="noeffect"
                            text={adminUrl}
                          />
                          <LangLink className="pb-[3px]" href={adminPath}>
                            {adminUrl}
                          </LangLink>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  )
                })}
              </Table.Body>
            </Table>
          </Table.Container>
        </Container>
      </Section>
    </>
  )
}
