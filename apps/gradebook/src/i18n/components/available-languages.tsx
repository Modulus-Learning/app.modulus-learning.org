'use client'

import type React from 'react'

import { CheckIcon } from '@infonomic/uikit/react'
import cx from 'classnames'
import { twMerge } from 'tailwind-merge'

import { useLangNavigation } from '@/i18n/hooks/use-lang-navigation'
import { availableLanguageMap as languageMap } from '@/i18n/language-map'
import type { AvailableLanguagesType } from '@/i18n/language-map'
import type { Locale } from '../i18n-config'

function hasMoreThanOneLanguage(availableLanguages: AvailableLanguagesType): boolean {
  const keys = Object.keys(availableLanguages)
  let count = 0
  for (const key of keys) {
    if (availableLanguages[key as keyof object]) {
      count += 1
    }
  }
  return count > 1
}

export function AvailableLanguages({
  lng,
  availableLanguages,
  className,
}: {
  lng: Locale
  availableLanguages: AvailableLanguagesType
  className?: string
}): React.JSX.Element | null {
  const { navigate } = useLangNavigation(lng)

  const handleOnClick = (requestedLocale: Locale) => () => {
    // Special syntax for href: '.' which means the current pathname.
    // navigate will take care of special casing the locale
    // change, including checking to see if there is a cookie
    // set or not, and either routing via the client router
    // or calling setLanguageAction and updating the cookie.
    navigate({ href: '.', locale: requestedLocale })
  }

  if (hasMoreThanOneLanguage(availableLanguages)) {
    const keys = Object.keys(availableLanguages)
    return (
      <div className={twMerge('flex gap-2 items-center justify-start mb-2', className)}>
        <span className="text-[0.9rem]">Language:</span>
        {keys.map((availableLanguage) => {
          if (availableLanguages[availableLanguage as keyof object]) {
            const active = availableLanguage === lng
            return (
              <button
                type="button"
                aria-label={`select language ${availableLanguage}`}
                tabIndex={0}
                key={availableLanguage}
                onClick={handleOnClick(availableLanguage as Locale)}
                className={cx(
                  'flex flex-row gap-1 rounded items-center justify-center text-[0.8rem] border min-w-[70px] py-[1px] px-[5px]',
                  'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700/50 dark:hover:bg-gray-700 dark:border-gray-700',
                  active ? 'text-left' : 'text-center'
                )}
              >
                {active && (
                  <span>
                    <CheckIcon
                      width="18px"
                      height="18px"
                      svgClassName="fill-green-600 dark:fill-green-600"
                    />
                  </span>
                )}
                <span className="inline-block w-full flex-1 text-black dark:text-gray-300">
                  {languageMap[availableLanguage]?.nativeName}
                </span>
              </button>
            )
          }
          return null
        })}
      </div>
    )
  }
  return null
}
