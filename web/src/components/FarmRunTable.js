'use client';

import Link from 'next/link';
import { CurrencyValue } from '@/components/CurrencyIcon';
import PoeChromeIcon from '@/components/PoeChromeIcon';
import { formatDate, formatDuration, getPoeVersionLabel } from '@/lib/utils';

function getRunMapLabel(run) {
  const maps = Array.isArray(run?.maps) ? run.maps : [];
  if (maps.length > 0) {
    return maps[0].mapName || 'Unknown Map';
  }
  return run?.mapName || 'Mixed Maps';
}

function getProfitContent(run, t) {
  if (run.profitChaos === null || run.profitChaos === undefined) {
    return <span className="text-poe-mist">{t('farmingHub.notCalculated')}</span>;
  }

  return <CurrencyValue value={run.profitChaos} type="chaos" size={14} />;
}

export default function FarmRunTable({ runs, t }) {
  if (!runs || runs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-poe-border bg-[rgba(11,9,8,0.6)] p-10 text-center">
        <p className="font-display text-xl uppercase tracking-[0.14em] text-stone-200">{t('farmingHub.emptyTitle')}</p>
        <p className="mt-3 text-sm text-poe-mist">{t('farmingHub.emptyBody')}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.62)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead>
            <tr className="border-b border-poe-border bg-[rgba(255,255,255,0.02)] text-[0.68rem] uppercase tracking-[0.16em] text-poe-mist">
              <th className="px-4 py-4 text-left font-semibold">{t('farmingHub.table.run')}</th>
              <th className="px-4 py-4 text-left font-semibold">{t('common.map')}</th>
              <th className="px-4 py-4 text-right font-semibold">{t('common.profit')}</th>
              <th className="px-4 py-4 text-center font-semibold">{t('common.runs')}</th>
              <th className="px-4 py-4 text-left font-semibold">{t('common.duration')}</th>
              <th className="px-4 py-4 text-left font-semibold">{t('common.author')}</th>
              <th className="px-4 py-4 text-left font-semibold">{t('common.published')}</th>
              <th className="px-4 py-4 text-center font-semibold">{t('publicStrategies.table.details')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-poe-border/70">
            {runs.map((run) => (
              <tr key={run.id} className="transition-colors hover:bg-[rgba(255,255,255,0.03)]">
                <td className="px-4 py-4 align-top">
                  <p className="font-display text-lg uppercase tracking-[0.08em] text-stone-100">
                    {run.farmType || t('farmingHub.unknownFarm')}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="context-chip border-sky-500/30 bg-sky-500/10 text-sky-200">
                      {getPoeVersionLabel(run.poeVersion)}
                    </span>
                    <span className="context-chip border-poe-border bg-poe-gold/10 text-stone-200">
                      {run.league || t('common.none')}
                    </span>
                    <span className="context-chip border-emerald-500/20 bg-emerald-500/10 text-emerald-200">
                      {run.calculationStatus || t('farmingHub.notCalculated')}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4 align-top">
                  <p className="font-semibold text-stone-100">{getRunMapLabel(run)}</p>
                  {run.setupDescription && (
                    <p className="mt-2 max-w-[20rem] text-sm text-poe-mist">{run.setupDescription}</p>
                  )}
                </td>
                <td className="px-4 py-4 text-right font-semibold text-emerald-300">
                  {getProfitContent(run, t)}
                </td>
                <td className="px-4 py-4 text-center font-semibold text-stone-100">{run.runCount}</td>
                <td className="px-4 py-4 text-sm text-poe-mist">{formatDuration(run.durationSeconds)}</td>
                <td className="px-4 py-4 align-top">
                  <div className="inline-flex items-center gap-2 text-stone-200">
                    <PoeChromeIcon type="gate" size={14} className="text-poe-gold/80" />
                    <span>{run.publisherDisplayName || run.author?.username || t('common.none')}</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-stone-300">
                  {run.publishedAt ? formatDate(run.publishedAt) : t('common.none')}
                </td>
                <td className="px-4 py-4 text-center">
                  <Link
                    href={`/farming-hub/${run.id}`}
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
