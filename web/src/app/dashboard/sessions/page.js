'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useTrackerContext } from '@/hooks/useTrackerContext';
import Navbar from '@/components/Navbar';
import PoeChromeIcon from '@/components/PoeChromeIcon';
import SessionList from '@/components/SessionList';
import { sessionAPI } from '@/lib/api';
import { formatChaos, getPoeVersionLabel } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function SessionsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { poeVersion, league } = useTrackerContext();

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (user) {
      loadSessions();
    }
  }, [user, authLoading, router, filter, poeVersion, league]);

  const loadSessions = async (pageNum = 1) => {
    try {
      setLoading(true);

      const params = {
        limit: 20,
        offset: (pageNum - 1) * 20,
        poeVersion,
        league,
      };

      if (filter !== 'all') {
        params.status = filter;
      }

      const response = await sessionAPI.getAll(params);

      if (pageNum === 1) {
        setSessions(response.data?.sessions || []);
      } else {
        setSessions((prev) => [...prev, ...(response.data?.sessions || [])]);
      }

      setHasMore((response.data?.sessions || []).length === 20);
    } catch (error) {
      console.error('Session loading error:', error);
      toast.error('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleEndSession = async (sessionId) => {
    if (!confirm('Do you want to end this session?')) return;

    try {
      const response = await sessionAPI.end(sessionId);
      if (response.success) {
        const profit = parseFloat(response.data.session.profitChaos);
        const message = `Session completed. Profit: ${formatChaos(profit)}`;
        if (profit >= 0) {
          toast.success(message);
        } else {
          toast(message);
        }
        loadSessions();
      }
    } catch (error) {
      toast.error(error.error || 'Failed to end session');
    }
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadSessions(nextPage);
  };

  if (authLoading) {
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
                <PoeChromeIcon type="sessions" size={14} className="text-poe-gold/80" />
                <span>Run Archive</span>
              </p>
              <h1 className="mt-3 font-display text-4xl uppercase leading-none text-stone-100">
                Session Ledger
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-poe-mist">
                Review completed routes, current expeditions, and abandoned runs without losing the active game and league context.
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
                <span>Status Filter</span>
              </p>
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(1);
                }}
                className="input mt-3 min-w-[12rem] text-sm"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="abandoned">Abandoned</option>
              </select>
            </div>
          </div>
        </section>

        <div className="card">
          <SessionList
            sessions={sessions}
            showActions={filter === 'active' || filter === 'all'}
            onEndSession={handleEndSession}
          />

          {hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={loadMore}
                disabled={loading}
                className="btn btn-secondary disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
