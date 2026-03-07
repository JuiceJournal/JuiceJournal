'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useTrackerContext } from '@/hooks/useTrackerContext';
import Navbar from '@/components/Navbar';
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Map Sessions
            </h1>
            <p className="mt-1 text-gray-400">
              Showing {getPoeVersionLabel(poeVersion)} sessions in {league}
            </p>
          </div>

          <div className="flex items-center space-x-4">
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
              className="bg-poe-card border border-poe-border rounded px-3 py-2 text-white focus:border-poe-gold focus:outline-none"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="abandoned">Abandoned</option>
            </select>
          </div>
        </div>

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
              className="px-6 py-2 bg-poe-card border border-poe-border text-gray-300 rounded hover:bg-poe-border transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
