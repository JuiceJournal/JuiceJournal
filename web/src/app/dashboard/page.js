'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { useSocket } from '@/hooks/useSocket';
import { useTrackerContext } from '@/hooks/useTrackerContext';
import Navbar from '@/components/Navbar';
import PoeChromeIcon from '@/components/PoeChromeIcon';
import ProfitChart from '@/components/ProfitChart';
import SessionList from '@/components/SessionList';
import AddLootModal from '@/components/AddLootModal';
import { getApiErrorMessage, opsAPI, priceAPI, sessionAPI, statsAPI } from '@/lib/api';
import { getPoeVersionLabel, getProfitColorClass } from '@/lib/utils';
import { CurrencyValue } from '@/components/CurrencyIcon';
import toast from 'react-hot-toast';

export default function DashboardPage() {
  const router = useRouter();
  const { user, capabilities, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const { connected, lastMessage } = useSocket();
  const { poeVersion, league } = useTrackerContext();

  const [activeSession, setActiveSession] = useState(null);
  const [stats, setStats] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const [opsData, setOpsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLootModal, setShowLootModal] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (user) {
      loadDashboardData();
      if (capabilities?.canSyncPrices) {
        loadOperationsData();
      }
    }
  }, [user, authLoading, router, poeVersion, league, capabilities]);

  useEffect(() => {
    if (lastMessage) {
      switch (lastMessage.type) {
        case 'SESSION_STARTED':
        case 'SESSION_COMPLETED':
        case 'LOOT_ADDED':
        case 'LOOT_BULK_ADDED':
          loadDashboardData();
          break;
      }
    }
  }, [lastMessage, poeVersion, league]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      const [activeRes, statsRes, sessionsRes] = await Promise.all([
        sessionAPI.getActive().catch(() => ({ data: { session: null } })),
        statsAPI.getPersonal('weekly', { poeVersion, league }),
        sessionAPI.getAll({ limit: 5, poeVersion, league }),
      ]);

      setActiveSession(activeRes.data?.session);
      setStats(statsRes.data);
      setRecentSessions(sessionsRes.data?.sessions || []);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('toast.dashboardLoadError')));
    } finally {
      setLoading(false);
    }
  };

  const loadOperationsData = async () => {
    try {
      const [{ data: syncStatus }, health] = await Promise.all([
        priceAPI.getSyncStatus(),
        opsAPI.getHealth(),
      ]);

      setOpsData({
        syncStatus,
        health
      });
    } catch {
      setOpsData(null);
    }
  };

  const handleStartSession = async () => {
    const mapName = prompt(t('prompt.enterMap', { version: getPoeVersionLabel(poeVersion), league }), 'Dunes Map');
    if (!mapName) return;

    try {
      const response = await sessionAPI.start({ mapName, poeVersion, league });
      if (response.success) {
        toast.success(t('toast.startSessionSuccess', { mapName, league }));
        loadDashboardData();
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('toast.startSessionError')));
    }
  };

  const handleEndSession = async () => {
    if (!activeSession) return;
    if (!confirm(t('prompt.endActiveSession'))) return;

    try {
      const response = await sessionAPI.end(activeSession.id);
      if (response.success) {
        const profit = parseFloat(response.data.session.profitChaos);
        const profitVal = profit >= 0 ? profit.toFixed(1) : Math.abs(profit).toFixed(1);
        if (profit >= 0) {
          toast.success(t('toast.profit', { value: `${profitVal}c` }));
        } else {
          toast(t('toast.loss', { value: `${profitVal}c` }));
        }
        loadDashboardData();
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('toast.endSessionError')));
    }
  };

  const activeSessionMatchesContext = activeSession
    ? activeSession.poeVersion === poeVersion && activeSession.league === league
    : true;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-poe-gold text-xl">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-poe-dark">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="card mb-8 overflow-visible">
          <div className="relative z-[1] grid gap-8 lg:grid-cols-[1.4fr_0.9fr] lg:items-end">
            <div>
              <p className="section-kicker">{t('dashboard.kicker')}</p>
              <h1 className="mt-3 max-w-3xl font-display text-4xl uppercase leading-none text-stone-100 sm:text-5xl">
                {t('dashboard.title')}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-poe-mist">
                {t('dashboard.body')}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <span className="context-chip border-sky-500/30 bg-sky-500/10 text-sky-200">
                  {getPoeVersionLabel(poeVersion)}
                </span>
                <span className="context-chip border-poe-border bg-poe-gold/10 text-stone-200">
                  {league}
                </span>
                <span className={`context-chip ${connected ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
                  {connected ? t('dashboard.liveFeedActive') : t('dashboard.socketOffline')}
                </span>
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={handleStartSession} className="btn btn-primary">
                  <PoeChromeIcon type="atlas" size={16} />
                  {t('dashboard.startNewMap')}
                </button>
                {activeSession && (
                  <button onClick={() => setShowLootModal(true)} className="btn btn-secondary">
                    <PoeChromeIcon type="vault" size={16} />
                    {t('dashboard.addLoot')}
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.88)] p-4">
                <p className="section-kicker inline-flex items-center gap-2">
                  <PoeChromeIcon type="pulse" size={14} className="text-poe-gold/80" />
                  <span>{t('dashboard.connection')}</span>
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <span className={`h-3 w-3 rounded-full ${connected ? 'bg-emerald-400 shadow-[0_0_14px_rgba(74,222,128,0.55)]' : 'bg-red-400 shadow-[0_0_14px_rgba(248,113,113,0.4)]'}`} />
                  <span className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-200">
                    {connected ? t('dashboard.websocketLinked') : t('dashboard.realtimeInterrupted')}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.88)] p-4">
                <p className="section-kicker inline-flex items-center gap-2">
                  <PoeChromeIcon type="route" size={14} className="text-poe-gold/80" />
                  <span>{t('dashboard.sessionStatus')}</span>
                </p>
                <p className="mt-3 text-lg font-display uppercase tracking-[0.12em] text-poe-gold">
                  {activeSession ? activeSession.mapName : t('dashboard.noActiveRun')}
                </p>
                <p className="mt-1 text-sm text-poe-mist">
                  {activeSession
                    ? `${activeSession.league} / ${getPoeVersionLabel(activeSession.poeVersion)}`
                    : t('dashboard.openFreshRoute')}
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
          <div className="card">
            <p className="section-kicker inline-flex items-center gap-2">
              <PoeChromeIcon type="market" size={14} className="text-poe-gold/80" />
              <span>{t('dashboard.contextProfit')}</span>
            </p>
            <p className={`mt-3 text-3xl font-semibold ${getProfitColorClass(stats?.summary?.totalProfit || 0)}`}>
              <CurrencyValue value={stats?.summary?.totalProfit || 0} type="chaos" size={20} />
            </p>
            <p className="mt-3 text-sm text-poe-mist">{t('dashboard.contextProfitBody')}</p>
          </div>

          <div className="card">
            <p className="section-kicker inline-flex items-center gap-2">
              <PoeChromeIcon type="atlas" size={14} className="text-poe-gold/80" />
              <span>{t('dashboard.mapsCleared')}</span>
            </p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {stats?.summary?.totalSessions || 0}
            </p>
            <p className="mt-3 text-sm text-poe-mist">{t('dashboard.mapsClearedBody')}</p>
          </div>

          <div className="card">
            <p className="section-kicker inline-flex items-center gap-2">
              <PoeChromeIcon type="route" size={14} className="text-poe-gold/80" />
              <span>{t('dashboard.averageRoute')}</span>
            </p>
            <p className={`mt-3 text-3xl font-semibold ${getProfitColorClass(stats?.summary?.avgProfitPerMap || 0)}`}>
              <CurrencyValue value={stats?.summary?.avgProfitPerMap || 0} type="chaos" size={20} />
            </p>
            <p className="mt-3 text-sm text-poe-mist">{t('dashboard.averageRouteBody')}</p>
          </div>

          <div className="card">
            <p className="section-kicker inline-flex items-center gap-2">
              <PoeChromeIcon type="pulse" size={14} className="text-poe-gold/80" />
              <span>{t('dashboard.hourlyTempo')}</span>
            </p>
            <p className={`mt-3 text-3xl font-semibold ${getProfitColorClass(stats?.summary?.avgProfitPerHour || 0)}`}>
              <CurrencyValue value={stats?.summary?.avgProfitPerHour || 0} type="chaos" size={20} />
            </p>
            <p className="mt-3 text-sm text-poe-mist">{t('dashboard.hourlyTempoBody')}</p>
          </div>
        </div>

        {capabilities?.canSyncPrices && (
          <div className="card mb-8">
            <p className="section-kicker inline-flex items-center gap-2">
              <PoeChromeIcon type="gate" size={14} className="text-poe-gold/80" />
              <span>{t('ops.kicker')}</span>
            </p>
            <h2 className="panel-title">{t('ops.title')}</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.76)] p-4">
                <p className="section-kicker">{t('ops.apiStatus')}</p>
                <p className="mt-2 text-lg font-semibold text-stone-100">
                  {opsData?.health?.data?.status === 'OK' ? t('ops.reachable') : t('ops.unreachable')}
                </p>
              </div>
              <div className="rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.76)] p-4">
                <p className="section-kicker">{t('ops.syncContexts')}</p>
                <p className="mt-2 text-lg font-semibold text-stone-100">
                  {opsData?.syncStatus?.trackedContexts || 0}
                </p>
              </div>
              <div className="rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.76)] p-4">
                <p className="section-kicker">{t('ops.inFlight')}</p>
                <p className="mt-2 text-lg font-semibold text-stone-100">
                  {opsData?.syncStatus?.inFlightCount || 0}
                </p>
              </div>
              <div className="rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.76)] p-4">
                <p className="section-kicker">{t('ops.websocketClients')}</p>
                <p className="mt-2 text-lg font-semibold text-stone-100">
                  {opsData?.health?.data?.websocketClients || 0}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <div className="card">
              <p className="section-kicker inline-flex items-center gap-2">
                <PoeChromeIcon type="sessions" size={14} className="text-poe-gold/80" />
                <span>{t('dashboard.currentExpedition')}</span>
              </p>
              <h2 className="panel-title">
                {t('dashboard.activeSession')}
              </h2>

              {activeSession ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-poe-border bg-[rgba(10,8,7,0.78)] p-4">
                    <p className="text-gray-400 text-sm">{t('common.map')}</p>
                    <p className="mt-2 text-2xl font-display uppercase tracking-[0.1em] text-white">{activeSession.mapName}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="context-chip border-sky-500/30 bg-sky-500/10 text-sky-200">
                        {getPoeVersionLabel(activeSession.poeVersion)}
                      </span>
                      <span className="context-chip border-poe-border bg-poe-gold/10 text-stone-200">
                        {activeSession.league}
                      </span>
                      {activeSession.mapTier && (
                        <span className="context-chip border-poe-border bg-[rgba(255,255,255,0.04)] text-stone-300">
                          Tier {activeSession.mapTier}
                        </span>
                      )}
                    </div>
                  </div>

                  {!activeSessionMatchesContext && (
                    <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-300">
                      {t('dashboard.outOfContext')}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.76)] p-4">
                      <p className="section-kicker">{t('common.started')}</p>
                      <p className="mt-2 text-base font-semibold text-white">{new Date(activeSession.startedAt).toLocaleTimeString()}</p>
                    </div>
                    <div className="rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.76)] p-4">
                      <p className="section-kicker">{t('common.profit')}</p>
                      <p className={`mt-2 text-base font-semibold ${getProfitColorClass(activeSession.profitChaos)}`}>
                        <CurrencyValue value={activeSession.profitChaos} type="chaos" size={16} />
                      </p>
                    </div>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => setShowLootModal(true)}
                      className="flex-1 btn btn-primary"
                    >
                      <PoeChromeIcon type="vault" size={16} />
                      {t('dashboard.addLoot')}
                    </button>
                    <button
                      onClick={handleEndSession}
                      className="flex-1 rounded-md border border-red-500/25 bg-red-500/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.16em] text-red-300 transition-colors hover:bg-red-500/20"
                    >
                      {t('common.end')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-poe-border bg-[rgba(10,8,7,0.65)] px-6 py-10 text-center">
                  <p className="font-display text-xl uppercase tracking-[0.14em] text-stone-200">{t('dashboard.noActiveMap')}</p>
                  <p className="mt-3 text-sm text-poe-mist">{t('dashboard.noActiveMapBody')}</p>
                  <button
                    onClick={handleStartSession}
                    className="btn btn-primary mt-6"
                  >
                    {t('dashboard.startNewMap')}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            <ProfitChart data={stats?.dailyStats || []} />
          </div>
        </div>

        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="section-kicker inline-flex items-center gap-2">
                <PoeChromeIcon type="sessions" size={14} className="text-poe-gold/80" />
                <span>{t('dashboard.recentSessions')}</span>
              </p>
              <h2 className="panel-title">
                {t('dashboard.recentSessions')}
              </h2>
              <p className="text-sm text-poe-mist">
                {t('dashboard.filteredTo', { version: getPoeVersionLabel(poeVersion), league })}
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard/sessions')}
              className="rounded-full border border-poe-border bg-[rgba(20,17,14,0.7)] px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-poe-gold transition-colors hover:border-poe-gold/35 hover:text-amber-200"
            >
              {t('common.viewAll')}
            </button>
          </div>

          <SessionList sessions={recentSessions} />
        </div>
      </main>

      {showLootModal && activeSession && (
        <AddLootModal
          sessionId={activeSession.id}
          onClose={() => setShowLootModal(false)}
          onSuccess={loadDashboardData}
        />
      )}
    </div>
  );
}
