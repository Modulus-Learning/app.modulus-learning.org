'use client'

import { useRouter } from 'next/navigation'

import { Button, CloseIcon } from '@infonomic/uikit/react'

export function InterceptedModalClose(): React.JSX.Element {
  const router = useRouter()
  return (
    <Button
      className="w-[32px] h-[32px] min-w-[32px] mt-1 rounded-full"
      variant="filled"
      intent="primary"
      arial-label="Close"
      size="sm"
      onClick={() => {
        router.back()
      }}
    >
      <CloseIcon width="18px" height="18px" svgClassName="fill-white dark:fill-gray-200" />
    </Button>
  )
}
