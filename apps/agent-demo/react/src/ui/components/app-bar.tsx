'use client'

import { forwardRef, useEffect, useState } from 'react'

import cx from 'classnames'

import { Branding } from './branding'
import { ResetButton } from './reset-button'

interface AppBarProps {
  className?: string
  showResetButton?: boolean
}
export type Ref = HTMLDivElement

export const AppBar = forwardRef<Ref, AppBarProps>(function AppBar(
  { className, showResetButton, ...other },
  ref
) {
  // const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [hasScrolled, setHasScrolled] = useState(false)

  // const handleWindowClick = (): void => {
  //   setMobileMenuOpen(false)
  // }

  // useEffect(() => {
  //   window.addEventListener('click', handleWindowClick)
  //   return () => {
  //     window.removeEventListener('click', handleWindowClick)
  //   }
  // })

  const handleScroll = (): void => {
    const position = window.scrollY
    if (position > 100) {
      setHasScrolled(true)
    } else {
      setHasScrolled(false)
    }
  }

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  })

  const appBarBackground = hasScrolled
    ? 'bg-white dark:bg-canvas-700 border-b border-gray-200/50 dark:border-gray-900/70'
    : 'bg-white dark:bg-canvas-700 backdrop-blur-md'

  return (
    <header
      id="header"
      className={cx('sticky top-0 z-30 w-full', appBarBackground, className)}
      ref={ref}
      {...other}
    >
      <div
        id="app-bar"
        className={cx(
          'app-bar sticky top-0 flex min-h-[60px] w-full items-center gap-4 pl-0 pr-[12px]',
          'sm:gap-4 sm:pl-0 sm:pr-[18px]',
          'transition-all duration-500 ease-out'
        )}
      >
        <div className="lg:flex-initial mr-auto">
          <Branding />
        </div>
        {showResetButton === true && <ResetButton />}
      </div>
    </header>
  )
})
