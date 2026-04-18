'use client';

import { useI18n } from '@/hooks/useI18n';
import PoeChromeIcon from '@/components/PoeChromeIcon';

const ITEMS = [
  { key: 'showroom.valueTrack', icon: 'sessions' },
  { key: 'showroom.valueMeasure', icon: 'market' },
  { key: 'showroom.valueCompare', icon: 'ladder' },
];

export default function ShowroomValueStrip() {
  const { t } = useI18n();

  return (
    <section className="px-4 pb-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-3 sm:grid-cols-3">
        {ITEMS.map((item) => (
          <div key={item.key} className="showroom-strip-item">
            <PoeChromeIcon type={item.icon} size={16} className="text-poe-gold" />
            <span>{t(item.key)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
