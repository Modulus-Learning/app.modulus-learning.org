'use client'

import Image from 'next/image'

import logoBlack from '@/images/logo/modulus-logo-symbol-black.svg'
import logoWhite from '@/images/logo/modulus-logo-symbol-white.svg'

import './branding.css'

export function Branding() {
  return (
    <>
      <div className="branding -z-10 flex items-center justify-center w-[250px] h-[140px] relative mx-auto">
        <div className="glow absolute rounded-[100px] z-0 w-[200px] h-[200px] items-center justify-center" />
        <div className="absolute flex z-10 w-[250px] h-[250px] items-center justify-center">
          <Image src={logoWhite} className="hidden dark:block" width={110} alt="Modulus" />
          <Image src={logoBlack} className="block dark:hidden" width={110} alt="Modulus" />
        </div>
      </div>
      <div
        className="fixed rounded-full glow -z-20 top-[-500px] opacity-[0.15] dark:opacity-20"
        style={{ width: '90vw', height: '90vh' }}
      />
    </>
  )
}
