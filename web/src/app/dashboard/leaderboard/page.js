'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useTrackerContext } from '@/hooks/useTrackerContext';
import Navbar from '@/components/Navbar';
import PoeChromeIcon from '@/components/PoeChromeIcon';
import LeaderboardTable from '@/components/LeaderboardTable';
import { getApiErrorMessage, statsAPI } from '@/lib/api';
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
      toast.error(getApiErrorMessage(error, 'Unable to load the leaderboard right now.'));
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

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="card mb-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="section-kicker inline-flex items-center gap-2">
                <PoeChromeIcon type="ladder" size={14} className="text-poe-gold/80" />
                <span>League Rankings</span>
              </p>
              <h1 className="mt-3 font-display text-4xl uppercase leading-none text-stone-100">
                Profit Ladder
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-poe-mist">
                Compare farmers within the same economy context, not across incompatible leagues or games.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="context-chip border-sky-500/30 bg-sky-500/10 text-sky-200">
                  {getPoeVersionLabel(poeVersion)}
                </span>
                <span className="context-chip border-poe-border bg-poe-gold/10 text-stone-200">
                  {league}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-poe-border bg-[rgba(10,8,7,0.78)] p-4">
              <p className="section-kicker inline-flex items-center gap-2">
                <PoeChromeIcon type="vault" size={14} className="text-poe-gold/80" />
                <span>Ranking Window</span>
              </p>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="input mt-3 min-w-[12rem] text-sm"
              >
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="card">
            <p className="section-kicker inline-flex items-center gap-2">
              <PoeChromeIcon type="gate" size={14} className="text-poe-gold/80" />
              <span>Participants</span>
            </p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {leaderboard.length}
            </p>
            <p className="mt-3 text-sm text-poe-mist">Tracked accounts in the selected ranking window.</p>
          </div>

          <div className="card">
            <p className="section-kicker inline-flex items-center gap-2">
              <PoeChromeIcon type="atlas" size={14} className="text-poe-gold/80" />
              <span>Maps Counted</span>
            </p>
            <p className="mt-3 text-3xl font-semibold text-poe-gold">
              {leaderboard.reduce((sum, entry) => sum + entry.sessionCount, 0).toLocaleString()}
            </p>
            <p className="mt-3 text-sm text-poe-mist">All completed runs contributing to this ladder.</p>
          </div>

          <div className="card">
            <p className="section-kicker inline-flex items-center gap-2">
              <PoeChromeIcon type="market" size={14} className="text-poe-gold/80" />
              <span>Aggregate Profit</span>
            </p>
            <p className="mt-3 text-3xl font-semibold text-emerald-300">
              {leaderboard.reduce((sum, entry) => sum + entry.totalProfit, 0).toLocaleString()}c
            </p>
            <p className="mt-3 text-sm text-poe-mist">Combined value generated across ranked players.</p>
          </div>
        </div>

        <div className="card">
          <LeaderboardTable
            data={leaderboard}
            currentUserId={user?.id}
          />

          {leaderboard.length === 0 && !loading && (
            <div className="pt-8 text-center">
              <p className="text-gray-400">
                No data available for this period.
              </p>
              <p className="mt-2 text-sm text-poe-mist">
                Start farming maps in {league} to join the leaderboard.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
