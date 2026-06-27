interface PublicPageHeroProps {
  eyebrow?: string
  title: string
  description: string
}

export function PublicPageHero({ eyebrow, title, description }: PublicPageHeroProps) {
  return (
    <section className="landing-dot-grid relative overflow-hidden border-b border-[#D1E8E2] bg-white py-16 lg:py-20">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#E8F5F1]/40 to-transparent" />
      <div className="landing-container relative text-center">
        {eyebrow && (
          <span className="mb-3 inline-block text-sm font-bold text-[#0F6E56]">{eyebrow}</span>
        )}
        <h1 className="mb-4 text-3xl font-bold text-[#0D1F1A] sm:text-4xl">{title}</h1>
        <p className="mx-auto max-w-2xl text-base leading-[1.7] text-[#4A6B60]">{description}</p>
      </div>
    </section>
  )
}
