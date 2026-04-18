'use client';

import { useI18n } from '@/hooks/useI18n';
import PoeChromeIcon from '@/components/PoeChromeIcon';

const POINTS = [
  { titleKey: 'showroom.showcasePointOneTitle', bodyKey: 'showroom.showcasePointOneBody', icon: 'sessions' },
  { titleKey: 'showroom.showcasePointTwoTitle', bodyKey: 'showroom.showcasePointTwoBody', icon: 'market' },
  { titleKey: 'showroom.showcasePointThreeTitle', bodyKey: 'showroom.showcasePointThreeBody', icon: 'atlas' },
];

export default function ShowroomDesktopShowcase() {
  const { t } = useI18n();

  return (
    <section id="desktop-showcase" className="px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="showroom-mock-window">
          <div className="showroom-mock-topbar">
            <span />
            <span />
            <span />
          </div>
          <div className="showroom-mock-body">
            <div className="showroom-mock-hero">
              <p className="section-kicker">{t('showroom.mockKicker')}</p>
              <h3 className="showroom-mock-title">{t('showroom.mockTitle')}</h3>
            </div>
            <div className="showroom-mock-grid">
              <div className="showroom-mock-card">
                <span className="showroom-mock-metric-label">{t('showroom.mockMetricOneLabel')}</span>
                <span className="showroom-mock-metric-value">287c/h</span>
              </div>
              <div className="showroom-mock-card">
                <span className="showroom-mock-metric-label">{t('showroom.mockMetricTwoLabel')}</span>
                <span className="showroom-mock-metric-value">12</span>
              </div>
              <div className="showroom-mock-card showroom-mock-card-wide">
                <span className="showroom-mock-metric-label">{t('showroom.mockMetricThreeLabel')}</span>
                <div className="showroom-mock-bars">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div id="how-it-works">
          <p className="section-kicker">{t('showroom.showcaseKicker')}</p>
          <h2 className="mt-3 font-display text-4xl uppercase leading-none text-stone-100">
            {t('showroom.showcaseTitle')}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-poe-mist">
            {t('showroom.showcaseBody')}
          </p>

          <div className="mt-8 space-y-4">
            {POINTS.map((point) => (
              <article key={point.titleKey} className="showroom-feature-row">
                <div className="showroom-feature-icon">
                  <PoeChromeIcon type={point.icon} size={18} className="text-poe-gold" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-100">
                    {t(point.titleKey)}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-poe-mist">
                    {t(point.bodyKey)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
