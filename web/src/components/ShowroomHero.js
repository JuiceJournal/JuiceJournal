'use client';

import { useI18n } from '@/hooks/useI18n';
import PoeChromeIcon from '@/components/PoeChromeIcon';

export default function ShowroomHero() {
  const { t } = useI18n();

  return (
    <section className="relative overflow-hidden px-4 pb-10 pt-12 sm:px-6 lg:px-8 lg:pb-16 lg:pt-20">
      <div className="showroom-embers" />
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="relative z-[1]">
          <p className="section-kicker">{t('showroom.heroKicker')}</p>
          <h1 className="mt-4 max-w-4xl font-display text-5xl uppercase leading-[0.92] text-stone-100 sm:text-6xl lg:text-7xl">
            {t('showroom.heroTitle')}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-poe-mist sm:text-lg">
            {t('showroom.heroBody')}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#desktop-showcase" className="btn btn-primary">
              <PoeChromeIcon type="gate" size={16} />
              <span>{t('showroom.primaryCta')}</span>
            </a>
            <a href="#how-it-works" className="btn btn-secondary">
              <PoeChromeIcon type="route" size={16} />
              <span>{t('showroom.secondaryCta')}</span>
            </a>
          </div>
        </div>

        <div className="showroom-stage">
          <div className="showroom-stage-ring" />
          <div className="showroom-stage-panel">
            <div className="showroom-stage-label">
              <span className="context-chip border-sky-500/30 bg-sky-500/10 text-sky-200">PoE 1</span>
              <span className="context-chip border-amber-500/30 bg-amber-500/10 text-amber-200">PoE 2</span>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="showroom-character-card">
                <PoeChromeIcon type="atlas" size={24} className="text-poe-gold" />
                <p className="showroom-character-title">{t('showroom.poe1Title')}</p>
                <p className="showroom-character-body">{t('showroom.poe1Body')}</p>
              </div>
              <div className="showroom-character-card">
                <PoeChromeIcon type="vault" size={24} className="text-poe-gold" />
                <p className="showroom-character-title">{t('showroom.poe2Title')}</p>
                <p className="showroom-character-body">{t('showroom.poe2Body')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
