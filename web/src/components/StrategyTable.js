'use client';

import { memo } from 'react';
import Link from 'next/link';
import PoeChromeIcon from '@/components/PoeChromeIcon';
import SparklineChart from '@/components/SparklineChart';
import { CurrencyValue } from '@/components/CurrencyIcon';
import { createSparklineSeries, formatDate, getPoeVersionLabel } from '@/lib/utils';

export default memo(function StrategyTable({ strategies, t }) {
  if (!strategies || strategies.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-poe-border bg-[rgba(11,9,8,0.6)] p-10 text-center">
        <p className="font-display text-xl uppercase tracking-[0.14em] text-stone-200">{t('publicStrategies.emptyTitle')}</p>
        <p className="mt-3 text-sm text-poe-mist">{t('publicStrategies.emptyBody')}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.62)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1060px]">
          <thead>
            <tr className="border-b border-poe-border bg-[rgba(255,255,255,0.02)] text-[0.68rem] uppercase tracking-[0.16em] text-poe-mist">
              <th className="px-4 py-4 text-left font-semibold">{t('publicStrategies.table.strategy')}</th>
              <th className="px-4 py-4 text-left font-semibold">{t('publicStrategies.table.map')}</th>
              <th className="px-4 py-4 text-right font-semibold">{t('publicStrategies.table.avgProfit')}</th>
              <th className="px-4 py-4 text-right font-semibold">{t('publicStrategies.table.hourly')}</th>
              <th className="px-4 py-4 text-center font-semibold">{t('common.trend')}</th>
              <th className="px-4 py-4 text-left font-semibold">{t('common.tags')}</th>
              <th className="px-4 py-4 text-left font-semibold">{t('common.author')}</th>
              <th className="px-4 py-4 text-center font-semibold">{t('common.runs')}</th>
              <th className="px-4 py-4 text-left font-semibold">{t('publicStrategies.table.lastRun')}</th>
              <th className="px-4 py-4 text-center font-semibold">{t('publicStrategies.table.details')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-poe-border/70">
            {strategies.map((strategy) => (
              <tr key={strategy.id} className="transition-colors hover:bg-[rgba(255,255,255,0.03)]">
                <td className="px-4 py-4 align-top">
                  <p className="font-display text-lg uppercase tracking-[0.08em] text-stone-100">{strategy.name}</p>
                  <p className="mt-2 max-w-[22rem] text-sm text-poe-mist">{strategy.description || t('common.none')}</p>
                </td>
                <td className="px-4 py-4 align-top">
                  <p className="font-semibold text-stone-100">{strategy.mapName}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="context-chip border-sky-500/30 bg-sky-500/10 text-sky-200">
                      {getPoeVersionLabel(strategy.poeVersion)}
                    </span>
                    <span className="context-chip border-poe-border bg-poe-gold/10 text-stone-200">
                      {strategy.league}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4 text-right font-semibold text-emerald-300">
                  <CurrencyValue value={strategy.metrics.avgProfitChaos} type="chaos" size={14} />
                </td>
                <td className="px-4 py-4 text-right font-semibold text-amber-200">
                  <CurrencyValue value={strategy.metrics.avgProfitPerHour} type="chaos" size={14} />
                </td>
                <td className="px-4 py-4 text-center">
                  <SparklineChart data={createSparklineSeries(strategy.trend)} width={96} height={28} />
                </td>
                <td className="px-4 py-4 align-top">
                  <div className="flex max-w-[13rem] flex-wrap gap-2">
                    {strategy.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-4 align-top">
                  <div className="inline-flex items-center gap-2 text-stone-200">
                    <PoeChromeIcon type="gate" size={14} className="text-poe-gold/80" />
                    <span>{strategy.author?.username || t('common.none')}</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-center font-semibold text-stone-100">
                  {strategy.metrics.runCount}
                </td>
                <td className="px-4 py-4 text-sm text-stone-300">
                  {strategy.metrics.lastRunAt ? formatDate(strategy.metrics.lastRunAt) : t('common.none')}
                </td>
                <td className="px-4 py-4 text-center">
                  <Link
                    href={`/strategies/public/${strategy.slug}`}
                    className="inline-flex items-center gap-2 rounded-full border border-poe-border bg-[rgba(28,23,20,0.6)] px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-poe-gold transition-colors hover:border-poe-gold/30 hover:text-amber-200"
                  >
                    <PoeChromeIcon type="route" size={13} />
                    <span>{t('publicStrategies.table.details')}</span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
