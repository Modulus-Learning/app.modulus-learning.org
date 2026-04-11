'use client'

import { useEffect, useRef } from 'react'

import { useToastManager } from '@infonomic/uikit/react'

export function FlashToast({ message }: { message: string | null }) {
  const toastManager = useToastManager()
  const lastMessageRef = useRef<string | null>(null)

  useEffect(() => {
    if (message != null && message !== lastMessageRef.current) {
      lastMessageRef.current = message
      const parts = message.split('::')
      toastManager.add({
        title: parts[0],
        description: parts[1] ?? '',
        data: {
          intent: 'success',
          iconType: 'success',
        },
      })
    }
  }, [message, toastManager])

  return null
}
