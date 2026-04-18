'use client';

import { useI18n } from '@/hooks/useI18n';
import PoeChromeIcon from '@/components/PoeChromeIcon';

export default function ShowroomFarmShowcase() {
  const { t } = useI18n();

  return (
    <section className="px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[2rem] border border-poe-border bg-[linear-gradient(180deg,rgba(30,24,20,0.94),rgba(14,11,9,0.98))] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.35)]">
        <p className="section-kicker">{t('showroom.farmKicker')}</p>
        <div className="mt-3 grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-center">
          <div>
            <h2 className="font-display text-4xl uppercase leading-none text-stone-100">
              {t('showroom.farmTitle')}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-poe-mist">
              {t('showroom.farmBody')}
            </p>
          </div>

          <div className="grid gap-3">
            <div className="showroom-insight-chip">
              <PoeChromeIcon type="route" size={15} className="text-poe-gold" />
              <span>{t('showroom.farmPointOne')}</span>
            </div>
            <div className="showroom-insight-chip">
              <PoeChromeIcon type="market" size={15} className="text-poe-gold" />
              <span>{t('showroom.farmPointTwo')}</span>
            </div>
            <div className="showroom-insight-chip">
              <PoeChromeIcon type="ladder" size={15} className="text-poe-gold" />
              <span>{t('showroom.farmPointThree')}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
