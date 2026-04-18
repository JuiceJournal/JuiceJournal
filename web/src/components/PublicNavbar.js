'use client';

import Link from 'next/link';
import { useI18n } from '@/hooks/useI18n';
import PoeChromeIcon from '@/components/PoeChromeIcon';

export default function PublicNavbar() {
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-40 border-b border-poe-border/60 bg-[rgba(9,7,6,0.78)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-poe-border bg-[radial-gradient(circle_at_30%_30%,rgba(214,180,110,0.22),rgba(22,18,15,0.94))] shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-transform duration-200 group-hover:scale-[1.03]">
            <PoeChromeIcon type="sigil" size={24} className="text-poe-gold" />
          </div>
          <div>
            <p className="section-kicker">{t('brand.kicker')}</p>
            <p className="font-display text-xl uppercase tracking-[0.18em] text-poe-gold">
              {t('app.name')}
            </p>
          </div>
        </Link>

        <a href="#desktop-showcase" className="btn btn-primary">
          <PoeChromeIcon type="gate" size={15} />
          <span>{t('showroom.primaryCta')}</span>
        </a>
      </div>
    </header>
  );
}
