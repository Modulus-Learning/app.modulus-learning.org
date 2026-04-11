'use client'

import type React from 'react'

import { DrawerProvider, ToastProvider, ToastViewport } from '@infonomic/uikit/react'
import { CookiesProvider } from 'react-cookie'

import { PublicConfigProvider } from '@/config/provider'
import { ProgressBarProvider } from '@/context/progress-bar-provider'
import { TranslationsProvider } from '@/i18n/client/translations-provider'
import { AdminSessionProvider } from '@/modules/admin/session/provider'
import { UserSessionProvider } from '@/modules/app/session/provider'
import { ThemeProvider } from '@/ui/theme/provider'
import type { Translations } from '@/i18n/server'
import type { AdminSession } from '@/modules/admin/session/@types'
import type { UserSession } from '@/modules/app/session/@types'

export interface ProvidersProps {
  translations: Translations
  adminSession: AdminSession | null
  userSession: UserSession | null
  children: React.ReactNode
}

export function Providers({ translations, adminSession, userSession, children }: ProvidersProps) {
  return (
    <PublicConfigProvider>
      <AdminSessionProvider session={adminSession}>
        <UserSessionProvider session={userSession}>
          <ThemeProvider>
            <ToastProvider timeout={5000}>
              <ProgressBarProvider>
                <CookiesProvider defaultSetOptions={{ path: '/' }}>
                  <DrawerProvider>
                    <TranslationsProvider translations={translations}>
                      {children}
                    </TranslationsProvider>
                  </DrawerProvider>
                </CookiesProvider>
              </ProgressBarProvider>
              <ToastViewport position="bottom-right" />
            </ToastProvider>
          </ThemeProvider>
        </UserSessionProvider>
      </AdminSessionProvider>
    </PublicConfigProvider>
  )
}
