import Image from 'next/image'

import cx from 'classnames'

import logoWhite from '@/images/logo/modulus-logo-white.svg'
import { LangLink } from '../../i18n/components/lang-link'
import type { Locale } from '@/i18n/i18n-config'

export function SiteFooter({
  lng,
  sticky = false,
}: {
  lng: Locale
  sticky?: boolean
}): React.JSX.Element {
  const _t = (): void => {}

  return (
    <div className={cx('z-10 bottom-0 left-0 w-full overflow-hidden', { sticky })}>
      <footer
        className={cx('w-full min-w-full bg-canvas-800 px-[18px] pb-8 pt-8 dark:bg-canvas-800')}
      >
        <div
          className={cx(
            'footer-content text-white mx-auto max-w-[1200px]',
            'gap-0 lg:gap-8 sm:grid lg:grid-cols-[1fr_1.2fr_0.8fr]'
          )}
        >
          <div className="footer-1">
            <div id="branding" className="branding mb-2 -ml-1">
              <LangLink prefetch={false} href="/" lng={lng} aria-label="Home">
                <div className="mr-2 w-[200px] transition-all duration-500 ease-out">
                  <Image src={logoWhite} width={200} alt="Modulus" />
                </div>
              </LangLink>
            </div>
            <div className="hidden sm:block">
              <p className="text-[0.9em] mt-0">
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
            </div>
            <div className="hidden sm:block" style={{ marginBottom: '0.5em' }}>
              <span style={{ fontSize: '0.9em' }}>
                {/* <Trans t={t} i18nKey="footer"> */}
                This site is protected by reCAPTCHA and the Google&nbsp;
                <a
                  href="https://policies.google.com/privacy"
                  className="ext text-white"
                  target="_blank"
                  rel="noopener nofollow noreferrer"
                >
                  Privacy Policy
                </a>
                &nbsp;and&nbsp;
                <a
                  href="https://policies.google.com/terms"
                  className="ext text-white"
                  target="_blank"
                  rel="noopener nofollow noreferrer"
                >
                  Terms of Service
                </a>
                &nbsp;apply.
                {/* </Trans> */}
              </span>
            </div>
          </div>

          <div className="footer-2 pt-6">
            <div className="grid grid-cols-[1fr_1fr] gap-1 sm:grid-cols-[1fr_1fr_1fr] sm:gap-4 md:gap-6">
              <div>
                <div className="mb-[0.5em] mt-[0.1em] text-lg font-bold text-white">Sub Menu</div>
                <ul className="m-0 mb-[1.5em] list-none p-0">
                  <li className="my-0 flex p-0">
                    <LangLink
                      prefetch={false}
                      className="font-normal no-underline hover:underline text-white"
                      href="/"
                      lng={lng}
                    >
                      Home
                    </LangLink>
                  </li>
                  <li className="my-0 flex p-0">
                    <LangLink
                      prefetch={false}
                      className="font-normal no-underline hover:underline text-white"
                      href="/about"
                      lng={lng}
                    >
                      About
                    </LangLink>
                  </li>
                  <li className="my-0 flex p-0">
                    <LangLink
                      prefetch={false}
                      className="font-normal no-underline hover:underline text-white"
                      href="/about"
                      lng={lng}
                    >
                      Other
                    </LangLink>
                  </li>
                </ul>
              </div>
              <div>
                <div className="mb-[0.5em] mt-[0.1em] text-lg font-bold text-white">Resources</div>
                <ul className="m-0 mb-[1.5em] list-none p-0">
                  <li className="my-0 flex p-0">
                    <LangLink
                      prefetch={false}
                      className="font-normal no-underline hover:underline  text-white"
                      href="/docs"
                      lng={lng}
                    >
                      Docs
                    </LangLink>
                  </li>
                  <li className="my-0 flex p-0">
                    <LangLink
                      prefetch={false}
                      className="font-normal no-underline hover:underline text-white"
                      href="/about"
                      lng={lng}
                    >
                      Partners
                    </LangLink>
                  </li>
                  <li className="my-0 flex p-0">
                    <LangLink
                      prefetch={false}
                      className="font-normal no-underline hover:underline text-white"
                      href="/about"
                      lng={lng}
                    >
                      Other
                    </LangLink>
                  </li>
                </ul>
              </div>
              <div>
                <div className="mb-[0.5em] mt-[0.1em] text-lg font-bold text-white">Legal</div>
                <ul className="m-0 mb-[1.5em] list-none p-0">
                  <li className="my-0 flex p-0">
                    <LangLink
                      prefetch={false}
                      className="font-normal no-underline hover:underline text-white"
                      href="/about"
                      lng={lng}
                    >
                      Terms of Use
                    </LangLink>
                  </li>
                  <li className="my-0 flex p-0">
                    <LangLink
                      prefetch={false}
                      className="font-normal no-underline hover:underline text-white"
                      href="/about"
                      lng={lng}
                    >
                      Privacy Policy
                    </LangLink>
                  </li>
                  <li className="my-0 flex p-0">
                    <LangLink
                      prefetch={false}
                      className="font-normal no-underline hover:underline text-white"
                      href="/about"
                      lng={lng}
                    >
                      Cookies
                    </LangLink>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="footer-3 pt-0 sm:pt-[24px] sm:text-right">
            <div className="mb-[0.75em] mt-[0.1em] text-lg font-bold text-white">
              Connect with Us
            </div>
            <div className="mb-[1em]">
              <span>Social connect here...</span>
            </div>
            <div className="mt-[1.5em] block sm:hidden">
              <p className="text-[0.9em] mt-2">
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
            </div>
            <div className="sm:hidden" style={{ marginBottom: '0.5em' }}>
              <span style={{ fontSize: '0.9em' }}>
                {/* <Trans t={t} i18nKey="footer"> */}
                This site is protected by reCAPTCHA and the Google&nbsp;
                <a
                  href="https://policies.google.com/privacy"
                  className="ext text-white"
                  target="_blank"
                  rel="noopener nofollow noreferrer"
                >
                  Privacy Policy
                </a>
                &nbsp;and&nbsp;
                <a
                  href="https://policies.google.com/terms"
                  className="ext text-white"
                  target="_blank"
                  rel="noopener nofollow noreferrer"
                >
                  Terms of Service
                </a>
                &nbsp;apply.
                {/* </Trans> */}
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
