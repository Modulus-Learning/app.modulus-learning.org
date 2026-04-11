'use client'

import { startTransition, useActionState, useState } from 'react'

import {
  Avatar,
  Dropdown,
  Dropdown as DropdownMenu,
  IconButton,
  SignOutIcon,
  UserIcon,
} from '@infonomic/uikit/react'
import cx from 'classnames'

import { useTranslations } from '@/i18n/client'
import { useLangNavigation } from '@/i18n/hooks/use-lang-navigation'
import { signOut } from '@/modules/admin/session/password-auth'
import { useAdminSession } from '@/modules/admin/session/provider'
import type { Locale } from '@/i18n/i18n-config'

type AdminUserMenuIntrinsicProps = React.JSX.IntrinsicElements['div']
interface UserMenuProps extends AdminUserMenuIntrinsicProps {
  className?: string
  shiftMenu?: boolean
  color?: string
  lng: Locale
}

export function AdminUserMenu({
  className,
  lng,
  shiftMenu = true,
}: UserMenuProps): React.JSX.Element {
  const { navigate } = useLangNavigation(lng)
  const [adminMenuOpen, setAdminMenuOpen] = useState(false)
  const session = useAdminSession()
  const [_formState, formAction, _isPending] = useActionState(signOut, '')
  const { t } = useTranslations('common')

  const initials = `${session?.user.given_name?.slice(0, 1).toUpperCase() ?? ''}${session?.user.family_name?.slice(0, 1).toUpperCase() ?? ''}`

  const handleSignOut = () => {
    startTransition(() => {
      formAction()
    })
  }

  return (
    <div className={className}>
      <DropdownMenu.Root modal={false} open={adminMenuOpen} onOpenChange={setAdminMenuOpen}>
        <DropdownMenu.Trigger
          render={<IconButton size="sm" variant="filled" className="p-0 mt-1 w-[32px] h-[32px]" />}
        >
          <Avatar initials={initials} />
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={shiftMenu ? 10 : 10}
            className={cx(
              'z-40 rounded radix-side-bottom:animate-slide-down radix-side-top:animate-slide-up',
              'w-[160px] px-1.5 py-1 shadow-md',
              'bg-white dark:bg-canvas-800 border dark:border-canvas-700 shadow'
            )}
          >
            <DropdownMenu.Item
              className="flex items-center w-full"
              // NOTE: We need to use navigate in order to get BOTH
              // the select menu to close, and to navigate with a progress
              // indicator. We CANNOT use LangLink here.
              onClick={() => {
                setAdminMenuOpen(false)
                navigate({ href: '/admin/account', smoothScrollToTop: true })
              }}
            >
              <span className="inline-block w-[28px]">
                <UserIcon width="22px" height="22px" />
              </span>
              <span className="text-left inline-block leading-none w-full flex-1 text-black dark:text-gray-300">
                Account
              </span>
            </DropdownMenu.Item>
            <Dropdown.Separator className="my-1 border-t border-t-gray-300 dark:border-t-gray-700 w-[90%] mx-auto" />
            <DropdownMenu.Item>
              <form action={formAction} noValidate className="flex items-center w-full">
                <button type="button" onClick={handleSignOut} className="flex items-center w-full">
                  <span className="inline-block w-[28px]">
                    <SignOutIcon />
                  </span>
                  <span className="text-left inline-block w-full flex-1 leading-none text-black dark:text-gray-300">
                    {t('Sign Out')}
                  </span>
                </button>
              </form>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}
