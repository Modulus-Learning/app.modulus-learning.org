'use client'

import type React from 'react'

import { DrawerProvider, ToastProvider, ToastViewport } from '@infonomic/uikit/react'
import { CookiesProvider } from 'react-cookie'

import { PublicConfigProvider } from '@/config/provider'
import { ProgressBarProvider } from '@/context/progress-bar-provider'
import { TranslationsProvider } from '@/i18n/client/translations-provider'
import { ThemeProvider } from '@/ui/theme/provider'
import type { Translations } from '@/i18n/server'

export interface ProvidersProps {
  translations: Translations
  children: React.ReactNode
}

export function Providers({ translations, children }: ProvidersProps) {
  return (
    <PublicConfigProvider>
      <ThemeProvider>
        <ToastProvider timeout={5000}>
          <ProgressBarProvider>
            <CookiesProvider defaultSetOptions={{ path: '/' }}>
              <DrawerProvider>
                <TranslationsProvider translations={translations}>{children}</TranslationsProvider>
              </DrawerProvider>
            </CookiesProvider>
          </ProgressBarProvider>
          <ToastViewport position="bottom-right" />
        </ToastProvider>
      </ThemeProvider>
    </PublicConfigProvider>
  )
}
