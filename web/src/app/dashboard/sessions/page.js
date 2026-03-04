'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import Navbar from '@/components/Navbar';
import SessionList from '@/components/SessionList';
import { sessionAPI } from '@/lib/api';
import { formatChaos } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function SessionsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
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
  }, [user, authLoading, router, filter]);

  const loadSessions = async (pageNum = 1) => {
    try {
      setLoading(true);
      
      const params = {
        limit: 20,
        offset: (pageNum - 1) * 20,
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
      console.error('Session yukleme hatasi:', error);
      toast.error('Session\'lar yuklenirken hata olustu');
    } finally {
      setLoading(false);
    }
  };

  const handleEndSession = async (sessionId) => {
    if (!confirm('Bu session\'i bitirmek istiyor musunuz?')) return;

    try {
      const response = await sessionAPI.end(sessionId);
      if (response.success) {
        const profit = parseFloat(response.data.session.profitChaos);
        toast[profit >= 0 ? 'success' : 'warning'](
          `Session tamamlandi. Kâr: ${formatChaos(profit)}`
        );
        loadSessions();
      }
    } catch (error) {
      toast.error(error.error || 'Session bitirilemedi');
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
          <h1 className="text-2xl font-bold text-white mb-4 sm:mb-0">
            Map Session'lari
          </h1>
          
          <div className="flex items-center space-x-4">
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
              className="bg-poe-card border border-poe-border rounded px-3 py-2 text-white focus:border-poe-gold focus:outline-none"
            >
              <option value="all">Tümü</option>
              <option value="active">Aktif</option>
              <option value="completed">Tamamlanmis</option>
              <option value="abandoned">Iptal Edilmis</option>
            </select>
          </div>
        </div>

        {/* Sessions List */}
        <SessionList
          sessions={sessions}
          showActions={filter === 'active' || filter === 'all'}
          onEndSession={handleEndSession}
        />

        {/* Load More */}
        {hasMore && (
          <div className="mt-6 text-center">
            <button
              onClick={loadMore}
              disabled={loading}
              className="px-6 py-2 bg-poe-card border border-poe-border text-gray-300 rounded hover:bg-poe-border transition-colors disabled:opacity-50"
            >
              {loading ? 'Yukleniyor...' : 'Daha Fazla Yükle'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
