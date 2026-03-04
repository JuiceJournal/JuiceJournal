'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import Navbar from '@/components/Navbar';
import ProfitChart from '@/components/ProfitChart';
import SessionList from '@/components/SessionList';
import AddLootModal from '@/components/AddLootModal';
import { sessionAPI, statsAPI } from '@/lib/api';
import { formatChaos, getProfitColorClass } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { connected, lastMessage } = useSocket();
  
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
  }, [user, authLoading, router]);

  // WebSocket mesajlarini dinle
  useEffect(() => {
    if (lastMessage) {
      switch (lastMessage.type) {
        case 'SESSION_STARTED':
        case 'SESSION_COMPLETED':
          loadDashboardData();
          break;
        case 'LOOT_ADDED':
          loadDashboardData();
          break;
      }
    }
  }, [lastMessage]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Paralel istekler
      const [activeRes, statsRes, sessionsRes] = await Promise.all([
        sessionAPI.getActive().catch(() => ({ data: { session: null } })),
        statsAPI.getPersonal('weekly'),
        sessionAPI.getAll({ limit: 5 }),
      ]);

      setActiveSession(activeRes.data?.session);
      setStats(statsRes.data);
      setRecentSessions(sessionsRes.data?.sessions || []);
    } catch (error) {
      console.error('Dashboard veri yukleme hatasi:', error);
      toast.error('Veriler yuklenirken hata olustu');
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = async () => {
    const mapName = prompt('Map adini girin:', 'Dunes Map');
    if (!mapName) return;

    try {
      const response = await sessionAPI.start({ mapName });
      if (response.success) {
        toast.success(`${mapName} baslatildi`);
        loadDashboardData();
      }
    } catch (error) {
      toast.error(error.error || 'Session baslatilamadi');
    }
  };

  const handleEndSession = async () => {
    if (!activeSession) return;
    if (!confirm('Aktif session\'i bitirmek istiyor musunuz?')) return;

    try {
      const response = await sessionAPI.end(activeSession.id);
      if (response.success) {
        const profit = parseFloat(response.data.session.profitChaos);
        const message = profit >= 0
          ? `Kâr: ${formatChaos(profit)}`
          : `Zarar: ${formatChaos(Math.abs(profit))}`;
        toast[profit >= 0 ? 'success' : 'warning'](message);
        loadDashboardData();
      }
    } catch (error) {
      toast.error(error.error || 'Session bitirilemedi');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-poe-gold text-xl">Yukleniyor...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-poe-dark">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Connection Status */}
        <div className="flex justify-end mb-4">
          <div className={`flex items-center space-x-2 text-sm ${connected ? 'text-green-400' : 'text-red-400'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
            <span>{connected ? 'Canli' : 'Baglanti yok'}</span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="card">
            <p className="text-gray-400 text-sm">Bugunku Kâr</p>
            <p className={`text-2xl font-bold mt-1 ${getProfitColorClass(stats?.summary?.totalProfit || 0)}`}>
              {formatChaos(stats?.summary?.totalProfit || 0)}
            </p>
          </div>
          
          <div className="card">
            <p className="text-gray-400 text-sm">Toplam Map</p>
            <p className="text-2xl font-bold text-white mt-1">
              {stats?.summary?.totalSessions || 0}
            </p>
          </div>
          
          <div className="card">
            <p className="text-gray-400 text-sm">Ort. Kâr/Map</p>
            <p className={`text-2xl font-bold mt-1 ${getProfitColorClass(stats?.summary?.avgProfitPerMap || 0)}`}>
              {formatChaos(stats?.summary?.avgProfitPerMap || 0)}
            </p>
          </div>
          
          <div className="card">
            <p className="text-gray-400 text-sm">Saatlik Kâr</p>
            <p className={`text-2xl font-bold mt-1 ${getProfitColorClass(stats?.summary?.avgProfitPerHour || 0)}`}>
              {formatChaos(stats?.summary?.avgProfitPerHour || 0)}
            </p>
          </div>
        </div>

        {/* Active Session & Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Active Session */}
          <div className="lg:col-span-1">
            <div className="card">
              <h2 className="text-lg font-semibold text-poe-gold mb-4">
                Aktif Session
              </h2>
              
              {activeSession ? (
                <div className="space-y-4">
                  <div className="bg-poe-darker rounded p-4">
                    <p className="text-gray-400 text-sm">Map</p>
                    <p className="text-xl font-medium text-white">{activeSession.mapName}</p>
                    {activeSession.mapTier && (
                      <p className="text-gray-500 text-sm">Tier {activeSession.mapTier}</p>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-poe-darker rounded p-3">
                      <p className="text-gray-400 text-xs">Baslangic</p>
                      <p className="text-white">{new Date(activeSession.startedAt).toLocaleTimeString()}</p>
                    </div>
                    <div className="bg-poe-darker rounded p-3">
                      <p className="text-gray-400 text-xs">Kâr</p>
                      <p className={`font-medium ${getProfitColorClass(activeSession.profitChaos)}`}>
                        {formatChaos(activeSession.profitChaos)}
                      </p>
                    </div>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => setShowLootModal(true)}
                      className="flex-1 btn btn-primary py-2"
                    >
                      Loot Ekle
                    </button>
                    <button
                      onClick={handleEndSession}
                      className="flex-1 px-4 py-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                    >
                      Bitir
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">Aktif map yok</p>
                  <button
                    onClick={handleStartSession}
                    className="btn btn-primary"
                  >
                    Yeni Map Baslat
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Profit Chart */}
          <div className="lg:col-span-2">
            <ProfitChart data={stats?.dailyStats || []} />
          </div>
        </div>

        {/* Recent Sessions */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              Son Session'lar
            </h2>
            <button
              onClick={() => router.push('/dashboard/sessions')}
              className="text-poe-gold hover:text-poe-gold-dark text-sm"
            >
              Tümünü Gor →
            </button>
          </div>
          
          <SessionList sessions={recentSessions} />
        </div>
      </main>

      {/* Loot Modal */}
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
