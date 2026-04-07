'use client';

import { memo } from 'react';

const CURRENCY_ICONS = {
  chaos: { label: 'Chaos Orb', file: 'chaos.png' },
  divine: { label: 'Divine Orb', file: 'divine.png' },
  exalted: { label: 'Exalted Orb', file: 'exalted.png' },
  mirror: { label: 'Mirror of Kalandra', file: 'mirror.png' },
  vaal: { label: 'Vaal Orb', file: 'vaal.png' },
  alchemy: { label: 'Orb of Alchemy', file: 'alchemy.png' },
  fusing: { label: 'Orb of Fusing', file: 'fusing.png' },
  chromatic: { label: 'Chromatic Orb', file: 'chromatic.png' },
  alteration: { label: 'Orb of Alteration', file: 'alteration.png' },
  jewellers: { label: "Jeweller's Orb", file: 'jewellers.png' },
  scouring: { label: 'Orb of Scouring', file: 'scouring.png' },
  blessed: { label: 'Blessed Orb', file: 'blessed.png' },
  regal: { label: 'Regal Orb', file: 'regal.png' },
  regret: { label: 'Orb of Regret', file: 'regret.png' },
  gcp: { label: "Gemcutter's Prism", file: 'gcp.png' },
  chance: { label: 'Orb of Chance', file: 'chance.png' },
};

export const CurrencyIcon = memo(function CurrencyIcon({ type = 'chaos', size = 20, className = '' }) {
  const currency = CURRENCY_ICONS[type];
  if (!currency) return null;

  return (
    <img
      src={`/images/currency/${currency.file}`}
      alt={currency.label}
      title={currency.label}
      width={size}
      height={size}
      className={`inline-block flex-shrink-0 ${className}`}
      style={{ imageRendering: 'auto' }}
      draggable={false}
    />
  );
}

export default CurrencyIcon;

export function CurrencyValue({ value, type = 'chaos', size = 16, className = '', iconPosition = 'right' }) {
  const num = parseFloat(value);
  if (isNaN(num)) return <span className={className}>0</span>;

  const formatted = type === 'divine' ? num.toFixed(2) : num.toFixed(1);

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {iconPosition === 'left' && <CurrencyIcon type={type} size={size} />}
      <span>{formatted}</span>
      {iconPosition === 'right' && <CurrencyIcon type={type} size={size} />}
    </span>
  );
}

export { CURRENCY_ICONS };
