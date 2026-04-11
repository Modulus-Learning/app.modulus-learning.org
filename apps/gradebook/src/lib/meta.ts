import { getServerConfig } from '@/config'

export interface MetaOptions {
  title?: string
  path?: string
  description?: string
  image?: {
    url?: string
    width?: number
    height?: number
    type?: string
    alt?: string
  }
}

export async function getMeta(_lng: string, options: MetaOptions | null = null): Promise<any> {
  const { siteName, siteDescription, publicServerUrl: siteUrl } = getServerConfig()

  return {
    metadataBase: new URL(siteUrl),
    title: `${siteName} - ${options?.title ?? 'Home'}`,
    applicationName: siteName,
    description: options?.description ?? siteDescription,
    manifest: '/site.webmanifest?v15',
    alternates: {
      canonical: options?.path ?? '/',
    },
    openGraph: {
      title: `${siteName} - ${options?.title ?? 'Home'}`,
      description: options?.description ?? siteDescription,
      url: options?.path != null ? new URL(`${siteUrl}${options.path}`) : new URL(siteUrl),
      type: 'website',
      images: [
        {
          url: options?.image?.url ?? '/opengraph-image.png?v15',
          width: options?.image?.width ?? 2200,
          height: options?.image?.height ?? 1150,
          alt: options?.image?.alt ?? siteDescription,
          type: options?.image?.type ?? 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${siteName} - ${options?.title ?? 'Home'}`,
      description: options?.description ?? siteDescription,
      images: [
        {
          url: options?.image?.url ?? '/twitter-image.png?v15',
          width: options?.image?.width ?? 2200,
          height: options?.image?.height ?? 1150,
          alt: options?.image?.alt ?? siteDescription,
          type: options?.image?.type ?? 'image/png',
        },
      ],
    },
  }
}
