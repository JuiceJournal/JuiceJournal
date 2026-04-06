'use client';

import PoeChromeIcon from '@/components/PoeChromeIcon';
import SparklineChart from '@/components/SparklineChart';
import { CurrencyValue } from '@/components/CurrencyIcon';
import { createSparklineSeries, formatDate, getPoeVersionLabel } from '@/lib/utils';

export default function StrategyPreviewCard({ strategy, t, compact = false }) {
  if (!strategy) {
    return null;
  }

  return (
    <div className={`card ${compact ? 'p-5' : ''}`}>
      <div className="relative z-[1]">
        <p className="section-kicker inline-flex items-center gap-2">
          <PoeChromeIcon type="route" size={14} className="text-poe-gold/80" />
          <span>{t('strategies.previewTitle')}</span>
        </p>

        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-2xl font-display uppercase tracking-[0.12em] text-stone-100">
              {strategy.name}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-poe-mist">
              {strategy.description || t('common.none')}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="context-chip border-sky-500/30 bg-sky-500/10 text-sky-200">
                {getPoeVersionLabel(strategy.poeVersion)}
              </span>
              <span className="context-chip border-poe-border bg-poe-gold/10 text-stone-200">
                {strategy.league}
              </span>
              <span className="context-chip border-poe-border bg-[rgba(255,255,255,0.04)] text-stone-300">
                {strategy.mapName}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {strategy.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[18rem]">
            <div className="rounded-2xl border border-poe-border bg-[rgba(10,8,7,0.76)] p-4">
              <p className="section-kicker">{t('publicStrategies.table.avgProfit')}</p>
              <div className="mt-3 text-lg font-semibold text-emerald-300">
                <CurrencyValue value={strategy.metrics.avgProfitChaos} type="chaos" size={16} />
              </div>
            </div>
            <div className="rounded-2xl border border-poe-border bg-[rgba(10,8,7,0.76)] p-4">
              <p className="section-kicker">{t('publicStrategies.table.hourly')}</p>
              <div className="mt-3 text-lg font-semibold text-amber-200">
                <CurrencyValue value={strategy.metrics.avgProfitPerHour} type="chaos" size={16} />
              </div>
            </div>
            <div className="rounded-2xl border border-poe-border bg-[rgba(10,8,7,0.76)] p-4">
              <p className="section-kicker">{t('common.runs')}</p>
              <p className="mt-3 text-lg font-semibold text-stone-100">
                {strategy.metrics.runCount}
              </p>
            </div>
            <div className="rounded-2xl border border-poe-border bg-[rgba(10,8,7,0.76)] p-4">
              <p className="section-kicker">{t('publicStrategies.table.lastRun')}</p>
              <p className="mt-3 text-sm font-semibold text-stone-100">
                {strategy.metrics.lastRunAt ? formatDate(strategy.metrics.lastRunAt) : t('common.none')}
              </p>
            </div>
          </div>
        </div>

        {!compact && strategy.trend?.length > 0 && (
          <div className="mt-6 rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.74)] p-4">
            <p className="section-kicker inline-flex items-center gap-2">
              <PoeChromeIcon type="pulse" size={13} className="text-poe-gold/80" />
              <span>{t('publicStrategies.detailTrend')}</span>
            </p>
            <div className="mt-4 flex items-center justify-between gap-4">
              <SparklineChart data={createSparklineSeries(strategy.trend)} width={180} height={48} />
              <div className="grid flex-1 grid-cols-2 gap-2 text-xs text-poe-mist sm:grid-cols-4">
                {strategy.trend.map((point) => (
                  <div key={point.date} className="rounded-xl border border-poe-border/60 bg-[rgba(255,255,255,0.02)] px-3 py-2">
                    <p>{point.date.slice(5)}</p>
                    <p className="mt-1 font-semibold text-stone-200">{point.totalProfitChaos.toFixed(1)}c</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
