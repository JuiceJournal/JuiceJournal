'use client';

import { useI18n } from '@/hooks/useI18n';
import PoeChromeIcon from '@/components/PoeChromeIcon';

export default function ShowroomWorlds() {
  const { t } = useI18n();

  return (
    <section className="px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="section-kicker">{t('showroom.worldsKicker')}</p>
        <h2 className="mt-3 font-display text-4xl uppercase leading-none text-stone-100">
          {t('showroom.worldsTitle')}
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-7 text-poe-mist">
          {t('showroom.worldsBody')}
        </p>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <article className="showroom-world-card">
            <PoeChromeIcon type="atlas" size={20} className="text-poe-gold" />
            <h3 className="showroom-world-title">{t('showroom.worldOneTitle')}</h3>
            <p className="showroom-world-body">{t('showroom.worldOneBody')}</p>
          </article>
          <article className="showroom-world-card">
            <PoeChromeIcon type="vault" size={20} className="text-poe-gold" />
            <h3 className="showroom-world-title">{t('showroom.worldTwoTitle')}</h3>
            <p className="showroom-world-body">{t('showroom.worldTwoBody')}</p>
          </article>
        </div>
      </div>
    </section>
  );
}
