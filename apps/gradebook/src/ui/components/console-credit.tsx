'use client'

import { useEffect, useRef } from 'react'

export function ConsoleCredit(): null {
  const ref = useRef<number>(0)

  useEffect(() => {
    if (ref != null && ref.current === 0) {
      // eslint-disable-next-line no-console
      console.info('Designed and built by Infonomic (https://infonomic.io)')
      ref.current += 1
    }
  })

  return null
}
