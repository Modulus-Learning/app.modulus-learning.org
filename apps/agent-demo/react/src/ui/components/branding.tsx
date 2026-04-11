import type React from 'react'
import { Link } from '@tanstack/react-router'

import logoBlack from '../../images/logo/modulus-logo-black.svg'
import logoWhite from '../../images/logo/modulus-logo-white.svg'

export function Branding(): React.JSX.Element {
  return (
    <div className="w-[150px] sm:w-[150px] ml-4">
      <Link to="/">
        <img src={logoWhite} className="hidden dark:block" width={150} alt="Modulus" />
        <img src={logoBlack} className="block dark:hidden" width={150} alt="Modulus" />
      </Link>
    </div>
  )
}
