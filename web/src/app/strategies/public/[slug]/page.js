'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import PoeChromeIcon from '@/components/PoeChromeIcon';
import StrategyPreviewCard from '@/components/StrategyPreviewCard';
import { useI18n } from '@/hooks/useI18n';
import { getApiErrorMessage, publicStrategyAPI } from '@/lib/api';
import { formatDate, formatDuration } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function PublicStrategyDetailPage({ params }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [strategy, setStrategy] = useState(null);

  useEffect(() => {
    loadStrategy();
  }, [params.slug]);

  const loadStrategy = async () => {
    try {
      setLoading(true);
      const response = await publicStrategyAPI.getBySlug(params.slug);
      setStrategy(response.data?.strategy || null);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('publicStrategies.detailNotFound')));
      setStrategy(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-poe-dark">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/strategies/public"
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-poe-border bg-[rgba(28,23,20,0.6)] px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-poe-gold transition-colors hover:border-poe-gold/30 hover:text-amber-200"
        >
          <PoeChromeIcon type="route" size={14} />
          <span>{t('publicStrategies.detailBack')}</span>
        </Link>

        {loading ? (
          <div className="card text-center text-poe-gold">{t('common.loading')}</div>
        ) : !strategy ? (
          <div className="card text-center text-poe-mist">{t('publicStrategies.detailNotFound')}</div>
        ) : (
          <>
            <StrategyPreviewCard strategy={strategy} t={t} />

            <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <section className="card">
                <div className="relative z-[1]">
                  <p className="section-kicker inline-flex items-center gap-2">
                    <PoeChromeIcon type="market" size={14} className="text-poe-gold/80" />
                    <span>{t('publicStrategies.detailLoot')}</span>
                  </p>

                  <div className="mt-6 space-y-3">
                    {(strategy.topLootCategories || []).length === 0 && (
                      <div className="rounded-2xl border border-dashed border-poe-border bg-[rgba(10,8,7,0.65)] px-4 py-5 text-sm text-poe-mist">
                        {t('common.none')}
                      </div>
                    )}

                    {(strategy.topLootCategories || []).map((entry) => (
                      <div key={entry.itemType} className="flex items-center justify-between rounded-2xl border border-poe-border bg-[rgba(255,255,255,0.03)] px-4 py-3">
                        <span className="font-semibold uppercase tracking-[0.14em] text-stone-200">{entry.itemType}</span>
                        <span className="text-emerald-300">{entry.totalChaos.toFixed(1)}c</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="card">
                <div className="relative z-[1]">
                  <p className="section-kicker inline-flex items-center gap-2">
                    <PoeChromeIcon type="sessions" size={14} className="text-poe-gold/80" />
                    <span>{t('publicStrategies.detailHistory')}</span>
                  </p>

                  <div className="mt-6 overflow-hidden rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.62)]">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[680px]">
                        <thead>
                          <tr className="border-b border-poe-border bg-[rgba(255,255,255,0.02)] text-[0.68rem] uppercase tracking-[0.16em] text-poe-mist">
                            <th className="px-4 py-4 text-left font-semibold">{t('common.map')}</th>
                            <th className="px-4 py-4 text-left font-semibold">{t('common.started')}</th>
                            <th className="px-4 py-4 text-left font-semibold">{t('common.duration')}</th>
                            <th className="px-4 py-4 text-right font-semibold">{t('common.profit')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-poe-border/70">
                          {(strategy.runHistory || []).map((entry) => (
                            <tr key={entry.id} className="transition-colors hover:bg-[rgba(255,255,255,0.03)]">
                              <td className="px-4 py-4 text-stone-100">{entry.mapName}</td>
                              <td className="px-4 py-4 text-sm text-poe-mist">{formatDate(entry.startedAt)}</td>
                              <td className="px-4 py-4 text-sm text-poe-mist">{formatDuration(entry.durationSec)}</td>
                              <td className="px-4 py-4 text-right font-semibold text-emerald-300">{entry.profitChaos.toFixed(1)}c</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
