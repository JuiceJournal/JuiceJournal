'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import PoeChromeIcon from '@/components/PoeChromeIcon';
import { CurrencyValue } from '@/components/CurrencyIcon';
import FarmRunReactions from '@/components/FarmRunReactions';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { farmingHubAPI, getApiErrorMessage } from '@/lib/api';
import { formatDate, formatDuration, getPoeVersionLabel } from '@/lib/utils';
import toast from 'react-hot-toast';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export default function FarmingHubDetailPage({ params }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState(null);
  const [busyReaction, setBusyReaction] = useState(null);

  useEffect(() => {
    loadRun();
  }, [params.id]);

  const loadRun = async () => {
    try {
      setLoading(true);
      const response = await farmingHubAPI.getRunById(params.id);
      setRun(response.data?.run || null);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('farmingHub.detailNotFound')));
      setRun(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleReaction = async (reaction) => {
    if (!user) {
      toast.error(t('farmingHub.reactions.signIn'));
      return;
    }

    try {
      setBusyReaction(reaction);
      const response = await farmingHubAPI.toggleReaction(params.id, reaction);
      setRun(response.data?.run || run);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('farmingHub.reactions.error')));
    } finally {
      setBusyReaction(null);
    }
  };

  return (
    <div className="min-h-screen bg-poe-dark">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/farming-hub"
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-poe-border bg-[rgba(28,23,20,0.6)] px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-poe-gold transition-colors hover:border-poe-gold/30 hover:text-amber-200"
        >
          <PoeChromeIcon type="route" size={14} />
          <span>{t('farmingHub.detailBack')}</span>
        </Link>

        {loading ? (
          <div className="card text-center text-poe-gold">{t('common.loading')}</div>
        ) : !run ? (
          <div className="card text-center text-poe-mist">{t('farmingHub.detailNotFound')}</div>
        ) : (
          <>
            <section className="card">
              <div className="relative z-[1] grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
                <div>
                  <p className="section-kicker inline-flex items-center gap-2">
                    <PoeChromeIcon type="vault" size={14} className="text-poe-gold/80" />
                    <span>{t('farmingHub.kicker')}</span>
                  </p>
                  <h1 className="mt-3 font-display text-4xl uppercase leading-none text-stone-100">
                    {run.farmType || t('farmingHub.unknownFarm')}
                  </h1>
                  <p className="mt-4 max-w-3xl text-base leading-7 text-poe-mist">
                    {run.setupDescription || t('farmingHub.noSetupNotes')}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <span className="context-chip border-sky-500/30 bg-sky-500/10 text-sky-200">
                      {getPoeVersionLabel(run.poeVersion)}
                    </span>
                    <span className="context-chip border-poe-border bg-poe-gold/10 text-stone-200">
                      {run.league || t('common.none')}
                    </span>
                    <span className="context-chip border-emerald-500/20 bg-emerald-500/10 text-emerald-200">
                      {run.calculationStatus || t('farmingHub.notCalculated')}
                    </span>
                    <span className="context-chip border-poe-border bg-[rgba(255,255,255,0.03)] text-stone-300">
                      {run.investmentKnown ? t('farmingHub.investmentKnown') : t('farmingHub.investmentUnknown')}
                    </span>
                  </div>

                  <div className="mt-6 rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.72)] p-4">
                    <p className="section-kicker mb-3">{t('farmingHub.reactions.title')}</p>
                    <FarmRunReactions
                      run={run}
                      t={t}
                      interactive
                      busyReaction={busyReaction}
                      onToggle={toggleReaction}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.8)] p-4">
                    <p className="section-kicker">{t('common.profit')}</p>
                    <p className="mt-3 text-3xl font-semibold text-emerald-300">
                      {run.profitChaos === null || run.profitChaos === undefined
                        ? t('farmingHub.notCalculated')
                        : <CurrencyValue value={run.profitChaos} type="chaos" size={20} />}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.8)] p-4">
                    <p className="section-kicker">{t('common.runs')}</p>
                    <p className="mt-3 text-3xl font-semibold text-poe-gold">{run.runCount}</p>
                  </div>
                  <div className="rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.8)] p-4">
                    <p className="section-kicker">{t('common.duration')}</p>
                    <p className="mt-3 text-xl font-semibold text-stone-100">{formatDuration(run.durationSeconds)}</p>
                  </div>
                  <div className="rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.8)] p-4">
                    <p className="section-kicker">{t('common.author')}</p>
                    <p className="mt-3 text-xl font-semibold text-stone-100">
                      {run.publisherDisplayName || run.author?.username || t('common.none')}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <section className="card">
                <div className="relative z-[1]">
                  <p className="section-kicker inline-flex items-center gap-2">
                    <PoeChromeIcon type="sessions" size={14} className="text-poe-gold/80" />
                    <span>{t('farmingHub.mapBreakdown')}</span>
                  </p>

                  <div className="mt-6 overflow-hidden rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.62)]">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px]">
                        <thead>
                          <tr className="border-b border-poe-border bg-[rgba(255,255,255,0.02)] text-[0.68rem] uppercase tracking-[0.16em] text-poe-mist">
                            <th className="px-4 py-4 text-left font-semibold">{t('common.map')}</th>
                            <th className="px-4 py-4 text-left font-semibold">{t('common.duration')}</th>
                            <th className="px-4 py-4 text-left font-semibold">{t('common.status')}</th>
                            <th className="px-4 py-4 text-right font-semibold">{t('common.profit')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-poe-border/70">
                          {safeArray(run.maps).map((map, index) => (
                            <tr key={map.localRunId || `${map.mapName}-${index}`} className="transition-colors hover:bg-[rgba(255,255,255,0.03)]">
                              <td className="px-4 py-4 text-stone-100">{map.mapName || t('farmingHub.unknownMap')}</td>
                              <td className="px-4 py-4 text-sm text-poe-mist">{formatDuration(map.durationSeconds)}</td>
                              <td className="px-4 py-4 text-sm text-poe-mist">{map.calculationStatus || t('farmingHub.notCalculated')}</td>
                              <td className="px-4 py-4 text-right font-semibold text-emerald-300">
                                {map.profitChaos === null || map.profitChaos === undefined
                                  ? t('farmingHub.notCalculated')
                                  : <CurrencyValue value={map.profitChaos} type="chaos" size={14} />}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </section>

              <section className="card">
                <div className="relative z-[1]">
                  <p className="section-kicker inline-flex items-center gap-2">
                    <PoeChromeIcon type="market" size={14} className="text-poe-gold/80" />
                    <span>{t('farmingHub.topLoot')}</span>
                  </p>

                  <div className="mt-6 space-y-3">
                    {safeArray(run.topLoot).length === 0 && (
                      <div className="rounded-2xl border border-dashed border-poe-border bg-[rgba(10,8,7,0.65)] px-4 py-5 text-sm text-poe-mist">
                        {t('common.none')}
                      </div>
                    )}

                    {safeArray(run.topLoot).map((item) => (
                      <div key={item.name} className="flex items-center justify-between rounded-2xl border border-poe-border bg-[rgba(255,255,255,0.03)] px-4 py-3">
                        <div>
                          <p className="font-semibold text-stone-100">{item.name}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-poe-mist">x{item.quantity}</p>
                        </div>
                        <span className="font-semibold text-emerald-300">
                          <CurrencyValue value={item.totalChaos} type="chaos" size={14} />
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.72)] p-4 text-sm text-poe-mist">
                    <p>{t('farmingHub.publishedAt')}: {run.publishedAt ? formatDate(run.publishedAt) : t('common.none')}</p>
                    <p className="mt-2">{t('farmingHub.priceContext')}: {run.priceContext?.syncedAt || t('common.none')}</p>
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
