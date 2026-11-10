import { Image } from '@/framework'
import logoWhite from '../../../images/logo/modulus-logo-white.svg'

/**
 * Footer for the admin pages outside the authenticated area (sign-in). Unlike
 * `SiteFooter` it links nowhere in the public site: an admin-mode instance
 * serves no public pages, and a client-side visit to one runs a frontend-only
 * loader that fails.
 */
export function AdminFooter(): React.JSX.Element {
  return (
    <footer className="w-full min-w-full bg-canvas-800 px-[18px] py-8 dark:bg-canvas-800">
      <div className="footer-content text-white mx-auto max-w-[1200px] flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-[150px]">
          <Image src={logoWhite} width={150} alt="Modulus" />
        </div>
        <p className="text-[0.9em] m-0">
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
    </footer>
  )
}
