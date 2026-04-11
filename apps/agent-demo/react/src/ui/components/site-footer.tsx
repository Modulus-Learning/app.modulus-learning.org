'use client'

import { Link } from '@tanstack/react-router'

import logoBlack from '../../images/logo/modulus-logo-black.svg'
import logoWhite from '../../images/logo/modulus-logo-white.svg'
// import Logo from '@/images/logo'

export function SiteFooter() {
  return (
    <footer className="bg-canvas-700/50 text-white py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-[1.3fr_0.9fr_1fr_0.8fr] gap-8">
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <Link to="/">
                  <img src={logoWhite} className="hidden dark:block" width={150} alt="Modulus" />
                  <img src={logoBlack} className="block dark:hidden" width={150} alt="Modulus" />
                </Link>
              </div>
            </div>
            <p className="text-gray-400">Building the future of open educational resources.</p>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Project</h3>
            <ul className="space-y-2 text-gray-400">
              <li>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="/"
                  className="hover:text-white transition-colors"
                >
                  Documentation
                </a>
              </li>
              <li>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="/"
                  className="hover:text-white transition-colors"
                >
                  Roadmap
                </a>
              </li>
              <li>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="/"
                  className="hover:text-white transition-colors"
                >
                  Contributing
                </a>
              </li>
              <li>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="/"
                  className="hover:text-white transition-colors"
                >
                  Releases
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Community</h3>
            <ul className="space-y-2 text-gray-400">
              <li>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="/"
                  className="hover:text-white transition-colors"
                >
                  GitHub Discussions
                </a>
              </li>
              <li>
                <Link to="/" className="hover:text-white transition-colors">
                  Blog
                </Link>
              </li>
              <li>
                <Link to="/" className="hover:text-white transition-colors">
                  Newsletter
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Resources</h3>
            <ul className="space-y-2 text-gray-400">
              <li>
                <Link to="/" className="hover:text-white transition-colors">
                  API Reference
                </Link>
              </li>
              <li>
                <Link to="/" className="hover:text-white transition-colors">
                  Examples
                </Link>
              </li>
              <li>
                <Link to="/" className="hover:text-white transition-colors">
                  Tutorials
                </Link>
              </li>
              <li>
                <Link to="/" className="hover:text-white transition-colors">
                  Support
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-12 pt-8 text-center text-gray-400">
          <p>
            &copy; {new Date().getFullYear()} Infonomic. Open source and built with ❤️ by Infonomic.
          </p>
        </div>
      </div>
    </footer>
  )
}
