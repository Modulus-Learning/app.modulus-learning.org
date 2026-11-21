import cx from 'clsx'

import { Image, LangLink } from '@/framework'
import logoWhite from '../../images/logo/modulus-logo-white.svg'
import type { Locale } from '@/i18n/i18n-config'

/**
 * The packaged footer, shown by the sign-in/sign-up forms and the learner
 * dashboard layouts (and by the gradebook's public pages). It links only to
 * pages every installation has, plus the Modulus documentation, so it suits
 * any installation until footers become configurable.
 */

interface FooterLink {
  label: string
  href: string
  /** An absolute URL on another site, opened in a new tab. */
  external?: boolean
}

const LINKS: FooterLink[] = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Docs', href: 'https://modulus-learning.org/docs', external: true },
]

const linkClass = 'text-gray-300 transition-colors hover:text-white hover:underline'

function RecaptchaNotice(): React.JSX.Element {
  return (
    <p className="text-[0.9em]">
      This site is protected by reCAPTCHA and the Google{' '}
      <a
        href="https://policies.google.com/privacy"
        className="ext text-white"
        target="_blank"
        rel="noopener nofollow noreferrer"
      >
        Privacy Policy
      </a>{' '}
      and{' '}
      <a
        href="https://policies.google.com/terms"
        className="ext text-white"
        target="_blank"
        rel="noopener nofollow noreferrer"
      >
        Terms of Service
      </a>{' '}
      apply.
    </p>
  )
}

export function SiteFooter({
  lng,
  sticky = false,
}: {
  lng: Locale
  sticky?: boolean
}): React.JSX.Element {
  return (
    <div className={cx('z-10 bottom-0 left-0 w-full overflow-hidden', { sticky })}>
      <footer className="w-full min-w-full bg-canvas-800 px-[18px] pt-8 pb-8 dark:bg-canvas-800">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 text-white sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div id="branding" className="branding mb-2 -ml-1">
              <LangLink prefetch={false} href="/" lng={lng} aria-label="Home">
                <div className="mr-2 w-[200px] transition-all duration-500 ease-out">
                  <Image src={logoWhite} width={200} alt="Modulus" />
                </div>
              </LangLink>
            </div>
            <p className="mt-0 text-[0.9em]">
              Made with ❤️ by{' '}
              <a
                className="text-white"
                href="https://infonomic.io"
                target="_blank"
                rel="noopener noreferrer"
              >
                Infonomic
              </a>
            </p>
            <RecaptchaNotice />
          </div>
          <nav aria-label="Footer" className="sm:pt-2">
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {LINKS.map((link) => (
                <li key={link.href}>
                  {link.external ? (
                    <a
                      className={linkClass}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {link.label}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <LangLink className={linkClass} href={link.href} lng={lng}>
                      {link.label}
                    </LangLink>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  )
}
