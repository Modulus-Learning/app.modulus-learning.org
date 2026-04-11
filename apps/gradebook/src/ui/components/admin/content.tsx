'use client'

import type React from 'react'
import { useEffect } from 'react'

import cx from 'classnames'

import { useAdminMenu } from './menu-provider.tsx'

interface ContentProps {
  children: React.ReactNode
}

export function Content({ children }: ContentProps): React.JSX.Element {
  const { mobile, drawerOpen, closeDrawer } = useAdminMenu()

  const handleWindowClick = (): void => {
    if (mobile === true) {
      closeDrawer()
    }
  }

  useEffect(() => {
    window.addEventListener('click', handleWindowClick)
    return () => {
      window.removeEventListener('click', handleWindowClick)
    }
  })

  return (
    <div
      className={cx(
        'flex flex-1 flex-col transition-all duration-300 ease-in-out pb-[32px]',
        { '-ml-[220px]': mobile === true || drawerOpen === false },
        { 'ml-0': mobile === false && drawerOpen }
      )}
    >
      {children}
    </div>
  )
}
