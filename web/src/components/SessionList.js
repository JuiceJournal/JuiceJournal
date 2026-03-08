'use client';

import {
  formatDate,
  formatTime,
  formatDuration,
  getProfitColorClass,
  getPoeVersionLabel,
  getStatusColorClass,
  getStatusLabel,
} from '@/lib/utils';
import { CurrencyValue } from '@/components/CurrencyIcon';
import { useI18n } from '@/hooks/useI18n';

export default function SessionList({ sessions, showActions = false, onEndSession }) {
  const { t } = useI18n();

  if (!sessions || sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-poe-border bg-[rgba(11,9,8,0.6)] p-10 text-center">
        <p className="font-display text-xl uppercase tracking-[0.14em] text-stone-200">{t('sessions.noTitle')}</p>
        <p className="mt-3 text-sm text-poe-mist">{t('sessions.noBody')}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.62)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead>
            <tr className="border-b border-poe-border bg-[rgba(255,255,255,0.02)] text-[0.68rem] uppercase tracking-[0.16em] text-poe-mist">
              <th className="px-4 py-4 text-left font-semibold">{t('common.map')}</th>
              <th className="px-4 py-4 text-left font-semibold">{t('common.tier')}</th>
              <th className="px-4 py-4 text-left font-semibold">{t('common.started')}</th>
              <th className="px-4 py-4 text-left font-semibold">{t('common.duration')}</th>
              <th className="px-4 py-4 text-right font-semibold">{t('common.profit')}</th>
              <th className="px-4 py-4 text-center font-semibold">{t('sessions.table.status')}</th>
              {showActions && <th className="px-4 py-4 text-center font-semibold">{t('common.action')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-poe-border/70">
            {sessions.map((session) => (
              <tr key={session.id} className="transition-colors hover:bg-[rgba(255,255,255,0.03)]">
                <td className="px-4 py-4 align-top">
                  <p className="font-display text-lg uppercase tracking-[0.08em] text-stone-100">{session.mapName}</p>
                  {session.mapType && (
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-poe-mist">
                      {session.mapType}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="context-chip border-sky-500/30 bg-sky-500/10 text-sky-200">
                      {getPoeVersionLabel(session.poeVersion)}
                    </span>
                    <span className="context-chip border-poe-border bg-[rgba(198,161,91,0.08)] text-stone-200">
                      {session.league}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4 text-sm font-semibold text-stone-300">
                  {session.mapTier || '-'}
                </td>
                <td className="px-4 py-4">
                  <p className="text-sm font-semibold text-stone-200">{formatDate(session.startedAt)}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-poe-mist">{formatTime(session.startedAt)}</p>
                </td>
                <td className="px-4 py-4 text-sm text-stone-300">
                  {formatDuration(session.durationSec)}
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={`font-semibold ${getProfitColorClass(session.profitChaos)}`}>
                    <CurrencyValue value={session.profitChaos} type="chaos" size={14} />
                  </span>
                </td>
                <td className="px-4 py-4 text-center">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white ${getStatusColorClass(
                      session.status
                    )}`}
                  >
                    {getStatusLabel(session.status)}
                  </span>
                </td>
                {showActions && session.status === 'active' && (
                  <td className="px-4 py-4 text-center">
                    <button
                      onClick={() => onEndSession?.(session.id)}
                      className="rounded-full border border-red-500/25 bg-red-500/10 px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-red-300 transition-colors hover:bg-red-500/20"
                    >
                      {t('common.end')}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
