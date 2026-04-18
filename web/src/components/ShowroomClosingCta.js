'use client';

import { useI18n } from '@/hooks/useI18n';
import PoeChromeIcon from '@/components/PoeChromeIcon';

export default function ShowroomClosingCta() {
  const { t } = useI18n();

  return (
    <section className="px-4 pb-20 pt-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl text-center">
        <p className="section-kicker">{t('showroom.closingKicker')}</p>
        <h2 className="mt-3 font-display text-4xl uppercase leading-none text-stone-100">
          {t('showroom.closingTitle')}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-poe-mist">
          {t('showroom.closingBody')}
        </p>
        <div className="mt-8">
          <a href="#desktop-showcase" className="btn btn-primary">
            <PoeChromeIcon type="gate" size={16} />
            <span>{t('showroom.primaryCta')}</span>
          </a>
        </div>
      </div>
    </section>
  );
}
