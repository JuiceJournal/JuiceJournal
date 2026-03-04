'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import Navbar from '@/components/Navbar';
import LeaderboardTable from '@/components/LeaderboardTable';
import { statsAPI } from '@/lib/api';
import toast from 'react-hot-toast';

const PERIODS = [
  { value: 'daily', label: 'Gunluk' },
  { value: 'weekly', label: 'Haftalik' },
  { value: 'monthly', label: 'Aylik' },
];

const LEAGUES = ['Ancestor', 'Standard', 'Hardcore'];

export default function LeaderboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('weekly');
  const [league, setLeague] = useState('Ancestor');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (user) {
      loadLeaderboard();
    }
  }, [user, authLoading, router, period, league]);

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      const response = await statsAPI.getLeaderboard(league, period, 50);
      setLeaderboard(response.data?.leaderboard || []);
    } catch (error) {
      console.error('Leaderboard yukleme hatasi:', error);
      toast.error('Leaderboard yuklenirken hata olustu');
    } finally {
      setLoading(false);
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
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Leaderboard
            </h1>
            <p className="text-gray-400 mt-1">
              En basarili farmer'lar
            </p>
          </div>
          
          <div className="flex items-center space-x-4 mt-4 sm:mt-0">
            {/* League Select */}
            <select
              value={league}
              onChange={(e) => setLeague(e.target.value)}
              className="bg-poe-card border border-poe-border rounded px-3 py-2 text-white focus:border-poe-gold focus:outline-none"
            >
              {LEAGUES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>

            {/* Period Select */}
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="bg-poe-card border border-poe-border rounded px-3 py-2 text-white focus:border-poe-gold focus:outline-none"
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="card">
            <p className="text-gray-400 text-sm">Toplam Katilimci</p>
            <p className="text-2xl font-bold text-white mt-1">
              {leaderboard.length}
            </p>
          </div>
          
          <div className="card">
            <p className="text-gray-400 text-sm">Toplam Map</p>
            <p className="text-2xl font-bold text-poe-gold mt-1">
              {leaderboard.reduce((sum, e) => sum + e.sessionCount, 0).toLocaleString()}
            </p>
          </div>
          
          <div className="card">
            <p className="text-gray-400 text-sm">Toplam Kâr</p>
            <p className="text-2xl font-bold text-green-400 mt-1">
              {leaderboard.reduce((sum, e) => sum + e.totalProfit, 0).toLocaleString()}c
            </p>
          </div>
        </div>

        {/* Leaderboard Table */}
        <LeaderboardTable 
          data={leaderboard} 
          currentUserId={user?.id}
        />

        {/* Empty State */}
        {leaderboard.length === 0 && !loading && (
          <div className="text-center py-12">
            <p className="text-gray-400">
              Bu donem icin henüz veri bulunmuyor.
            </p>
            <p className="text-gray-500 text-sm mt-2">
              Map farm etmeye baslayarak liderlik tablosuna katilin!
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
