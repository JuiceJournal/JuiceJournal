'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useTrackerContext } from '@/hooks/useTrackerContext';
import Navbar from '@/components/Navbar';
import LeaderboardTable from '@/components/LeaderboardTable';
import { statsAPI } from '@/lib/api';
import { getPoeVersionLabel } from '@/lib/utils';
import toast from 'react-hot-toast';

const PERIODS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export default function LeaderboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { poeVersion, league } = useTrackerContext();

  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('weekly');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (user) {
      loadLeaderboard();
    }
  }, [user, authLoading, router, period, league, poeVersion]);

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      const response = await statsAPI.getLeaderboard(league, period, 50, { poeVersion });
      setLeaderboard(response.data?.leaderboard || []);
    } catch (error) {
      console.error('Leaderboard loading error:', error);
      toast.error('Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

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
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Leaderboard
            </h1>
            <p className="mt-1 text-gray-400">
              Comparing {getPoeVersionLabel(poeVersion)} farmers in {league}
            </p>
          </div>

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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="card">
            <p className="text-gray-400 text-sm">Total Participants</p>
            <p className="text-2xl font-bold text-white mt-1">
              {leaderboard.length}
            </p>
          </div>

          <div className="card">
            <p className="text-gray-400 text-sm">Total Maps</p>
            <p className="text-2xl font-bold text-poe-gold mt-1">
              {leaderboard.reduce((sum, entry) => sum + entry.sessionCount, 0).toLocaleString()}
            </p>
          </div>

          <div className="card">
            <p className="text-gray-400 text-sm">Total Profit</p>
            <p className="text-2xl font-bold text-green-400 mt-1">
              {leaderboard.reduce((sum, entry) => sum + entry.totalProfit, 0).toLocaleString()}c
            </p>
          </div>
        </div>

        <LeaderboardTable
          data={leaderboard}
          currentUserId={user?.id}
        />

        {leaderboard.length === 0 && !loading && (
          <div className="text-center py-12">
            <p className="text-gray-400">
              No data available for this period.
            </p>
            <p className="text-gray-500 text-sm mt-2">
              Start farming maps in {league} to join the leaderboard.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
