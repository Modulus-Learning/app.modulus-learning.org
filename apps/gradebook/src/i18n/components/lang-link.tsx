'use client'

import type React from 'react'
import Link from 'next/link'

import { useLangNavigation } from '@/i18n/hooks/use-lang-navigation'
import { i18nConfig, type Locale } from '@/i18n/i18n-config'

export interface LangLinkProps {
  href: string
  lng?: Locale
  forceReload?: boolean
  scroll?: boolean
  smoothScrollToTop?: boolean
  replace?: boolean
  useOnPointerDown?: boolean
  children?: React.ReactNode
  [key: string]: any
}

// Strategy based on....
// https://github.com/vercel/next.js/discussions/41934#discussioncomment-8996669
// https://github.com/vercel/react-transition-progress
export function LangLink({
  href,
  children,
  lng = i18nConfig.defaultLocale,
  forceReload,
  smoothScrollToTop,
  scroll = true,
  replace = false,
  useOnPointerDown = false,
  ref,
  ...rest
}: LangLinkProps & { ref?: React.Ref<HTMLAnchorElement> }) {
  const { navigate, getHref } = useLangNavigation(lng)
  const h = getHref(href)

  const handleTransition = (
    e: React.PointerEvent<HTMLAnchorElement> | React.MouseEvent<HTMLAnchorElement, MouseEvent>
  ): void => {
    e.preventDefault()
    navigate({ href, replace, scroll, smoothScrollToTop })
  }

  if (forceReload === true) {
    return (
      <a href={h} ref={ref} {...rest}>
        {children}
      </a>
    )
  }
  const handlers = useOnPointerDown
    ? { onPointerDown: handleTransition }
    : { onClick: handleTransition }

  return (
    <Link
      href={h}
      scroll={scroll}
      replace={replace}
      ref={ref}
      {...handlers}
      // TODO: perhaps we should set both - but set the 'not used' handler
      // to () => {} (noop)
      // onClick={useOnPointerDown === false ? handleTransition : undefined}
      // // NOTE: When LangLink appears asChild in Radix UI we must use onPointerDown
      // // and not onClick https://github.com/radix-ui/primitives/issues/1807
      // onPointerDown={useOnPointerDown === true ? handleTransition : undefined}
      {...rest}
    >
      {children}
    </Link>
  )
}
