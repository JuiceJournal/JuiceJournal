'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { useTrackerContext } from '@/hooks/useTrackerContext';
import Navbar from '@/components/Navbar';
import ProfitChart from '@/components/ProfitChart';
import SessionList from '@/components/SessionList';
import AddLootModal from '@/components/AddLootModal';
import { sessionAPI, statsAPI } from '@/lib/api';
import { getPoeVersionLabel, getProfitColorClass } from '@/lib/utils';
import { CurrencyValue } from '@/components/CurrencyIcon';
import toast from 'react-hot-toast';

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { connected, lastMessage } = useSocket();
  const { poeVersion, league } = useTrackerContext();

  const [activeSession, setActiveSession] = useState(null);
  const [stats, setStats] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLootModal, setShowLootModal] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (user) {
      loadDashboardData();
    }
  }, [user, authLoading, router, poeVersion, league]);

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
      console.error('Dashboard data loading error:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = async () => {
    const mapName = prompt(`Enter ${getPoeVersionLabel(poeVersion)} map name for ${league}:`, 'Dunes Map');
    if (!mapName) return;

    try {
      const response = await sessionAPI.start({ mapName, poeVersion, league });
      if (response.success) {
        toast.success(`${mapName} started in ${league}`);
        loadDashboardData();
      }
    } catch (error) {
      toast.error(error.error || 'Failed to start session');
    }
  };

  const handleEndSession = async () => {
    if (!activeSession) return;
    if (!confirm('Do you want to end the active session?')) return;

    try {
      const response = await sessionAPI.end(activeSession.id);
      if (response.success) {
        const profit = parseFloat(response.data.session.profitChaos);
        const profitVal = profit >= 0 ? profit.toFixed(1) : Math.abs(profit).toFixed(1);
        const message = profit >= 0
          ? `Profit: ${profitVal}c`
          : `Loss: ${profitVal}c`;
        if (profit >= 0) {
          toast.success(message);
        } else {
          toast(message);
        }
        loadDashboardData();
      }
    } catch (error) {
      toast.error(error.error || 'Failed to end session');
    }
  };

  const activeSessionMatchesContext = activeSession
    ? activeSession.poeVersion === poeVersion && activeSession.league === league
    : true;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-poe-gold text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-poe-dark">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="inline-flex rounded-full bg-sky-500/15 px-3 py-1 text-xs font-medium text-sky-300">
                {getPoeVersionLabel(poeVersion)}
              </span>
              <span className="inline-flex rounded-full bg-poe-card px-3 py-1 text-xs font-medium text-gray-300">
                {league}
              </span>
            </div>
          </div>

          <div className={`flex items-center space-x-2 text-sm ${connected ? 'text-green-400' : 'text-red-400'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
            <span>{connected ? 'Live' : 'Disconnected'}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="card">
            <p className="text-gray-400 text-sm">Context Profit</p>
            <p className={`text-2xl font-bold mt-1 ${getProfitColorClass(stats?.summary?.totalProfit || 0)}`}>
              <CurrencyValue value={stats?.summary?.totalProfit || 0} type="chaos" size={20} />
            </p>
          </div>

          <div className="card">
            <p className="text-gray-400 text-sm">Total Maps</p>
            <p className="text-2xl font-bold text-white mt-1">
              {stats?.summary?.totalSessions || 0}
            </p>
          </div>

          <div className="card">
            <p className="text-gray-400 text-sm">Avg. Profit/Map</p>
            <p className={`text-2xl font-bold mt-1 ${getProfitColorClass(stats?.summary?.avgProfitPerMap || 0)}`}>
              <CurrencyValue value={stats?.summary?.avgProfitPerMap || 0} type="chaos" size={20} />
            </p>
          </div>

          <div className="card">
            <p className="text-gray-400 text-sm">Hourly Profit</p>
            <p className={`text-2xl font-bold mt-1 ${getProfitColorClass(stats?.summary?.avgProfitPerHour || 0)}`}>
              <CurrencyValue value={stats?.summary?.avgProfitPerHour || 0} type="chaos" size={20} />
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-1">
            <div className="card">
              <h2 className="text-lg font-semibold text-poe-gold mb-4">
                Active Session
              </h2>

              {activeSession ? (
                <div className="space-y-4">
                  <div className="bg-poe-darker rounded p-4">
                    <p className="text-gray-400 text-sm">Map</p>
                    <p className="text-xl font-medium text-white">{activeSession.mapName}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="inline-flex rounded-full bg-sky-500/15 px-2 py-1 text-xs font-medium text-sky-300">
                        {getPoeVersionLabel(activeSession.poeVersion)}
                      </span>
                      <span className="inline-flex rounded-full bg-poe-card px-2 py-1 text-xs font-medium text-gray-300">
                        {activeSession.league}
                      </span>
                      {activeSession.mapTier && (
                        <span className="inline-flex rounded-full bg-poe-border px-2 py-1 text-xs font-medium text-gray-300">
                          Tier {activeSession.mapTier}
                        </span>
                      )}
                    </div>
                  </div>

                  {!activeSessionMatchesContext && (
                    <p className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                      This active session is outside the currently selected dashboard context.
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-poe-darker rounded p-3">
                      <p className="text-gray-400 text-xs">Started</p>
                      <p className="text-white">{new Date(activeSession.startedAt).toLocaleTimeString()}</p>
                    </div>
                    <div className="bg-poe-darker rounded p-3">
                      <p className="text-gray-400 text-xs">Profit</p>
                      <p className={`font-medium ${getProfitColorClass(activeSession.profitChaos)}`}>
                        <CurrencyValue value={activeSession.profitChaos} type="chaos" size={16} />
                      </p>
                    </div>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => setShowLootModal(true)}
                      className="flex-1 btn btn-primary py-2"
                    >
                      Add Loot
                    </button>
                    <button
                      onClick={handleEndSession}
                      className="flex-1 px-4 py-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                    >
                      End
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">No active map</p>
                  <button
                    onClick={handleStartSession}
                    className="btn btn-primary"
                  >
                    Start New Map
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            <ProfitChart data={stats?.dailyStats || []} />
          </div>
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Recent Sessions
              </h2>
              <p className="text-sm text-gray-500">
                Filtered to {getPoeVersionLabel(poeVersion)} / {league}
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard/sessions')}
              className="text-poe-gold hover:text-poe-gold-dark text-sm"
            >
              View All →
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
