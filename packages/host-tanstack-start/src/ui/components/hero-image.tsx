// https://medium.com/free-code-camp/a-guide-to-responsive-images-with-ready-to-use-templates-c400bd65c433
interface HeroImageProps {
  desktopJpeg: string
  desktopWebp: string
  tabletJpeg: string
  tabletWebp: string
  mobileJpeg: string
  mobileWebp: string
  alt: string
}

export function HeroImage({
  desktopJpeg,
  desktopWebp,
  tabletJpeg,
  tabletWebp,
  mobileJpeg,
  mobileWebp,
  alt,
}: HeroImageProps): React.JSX.Element {
  return (
    <picture className="flex-1 flex w-full h-full">
      <source media="(min-width: 900px)" srcSet={desktopWebp} type="image/webp" />
      <source media="(min-width: 900px)" srcSet={desktopJpeg} type="image/jpeg" />
      <source media="(min-width: 600px)" srcSet={tabletWebp} type="image/webp" />
      <source media="(min-width: 600px)" srcSet={tabletJpeg} type="image/jpeg" />
      <source srcSet={mobileWebp} type="image/webp" />
      <source srcSet={mobileJpeg} type="image/jpg" />
      <img
        style={{ objectFit: 'cover', objectPosition: 'top', height: 'auto', width: '100%' }}
        src={desktopJpeg}
        alt={alt}
      />
    </picture>
  )
}
