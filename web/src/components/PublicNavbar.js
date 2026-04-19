'use client';

import Link from 'next/link';
import { useI18n } from '@/hooks/useI18n';
import PoeChromeIcon from '@/components/PoeChromeIcon';
import BrandLogo from '@/components/BrandLogo';

export default function PublicNavbar() {
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-40 border-b border-poe-border/60 bg-[rgba(9,7,6,0.78)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-3">
          <BrandLogo
            alt="Juice Journal logo"
            width={44}
            height={44}
            priority
            className="h-11 w-11 shrink-0 drop-shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-transform duration-200 group-hover:scale-[1.03]"
          />
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
