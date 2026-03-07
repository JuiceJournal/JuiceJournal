'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useTrackerContext } from '@/hooks/useTrackerContext';
import Navbar from '@/components/Navbar';
import CurrencyIcon, { CurrencyValue } from '@/components/CurrencyIcon';
import SparklineChart from '@/components/SparklineChart';
import { priceAPI } from '@/lib/api';
import { getItemTypeLabel, getPoeVersionLabel } from '@/lib/utils';
import toast from 'react-hot-toast';

const POE1_TYPES = [
  { value: '', label: 'All', icon: null },
  { value: 'currency', label: 'Currency', icon: 'chaos' },
  { value: 'fragment', label: 'Fragment', icon: 'vaal' },
  { value: 'scarab', label: 'Scarab', icon: 'chance' },
  { value: 'map', label: 'Map', icon: 'alchemy' },
  { value: 'divination_card', label: 'Div Card', icon: 'divine' },
  { value: 'gem', label: 'Gem', icon: 'gcp' },
  { value: 'unique', label: 'Unique', icon: 'exalted' },
  { value: 'oil', label: 'Oil', icon: 'blessed' },
  { value: 'incubator', label: 'Incubator', icon: 'regret' },
  { value: 'delirium_orb', label: 'Delirium Orb', icon: 'chromatic' },
  { value: 'catalyst', label: 'Catalyst', icon: 'scouring' },
  { value: 'other', label: 'Other', icon: 'alteration' },
];

const POE2_TYPES = [
  { value: '', label: 'All', icon: null },
  { value: 'currency', label: 'Currency', icon: 'exalted' },
  { value: 'fragment', label: 'Fragment', icon: 'vaal' },
  { value: 'scarab', label: 'Scarab', icon: 'chance' },
  { value: 'map', label: 'Map', icon: 'alchemy' },
  { value: 'divination_card', label: 'Div Card', icon: 'divine' },
  { value: 'gem', label: 'Gem', icon: 'gcp' },
  { value: 'unique', label: 'Unique', icon: 'mirror' },
  { value: 'catalyst', label: 'Catalyst', icon: 'scouring' },
  { value: 'other', label: 'Other', icon: 'alteration' },
];

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-3 py-2.5"><div className="h-3 w-5 bg-poe-border/40 rounded" /></td>
      <td className="px-3 py-2.5"><div className="h-6 w-6 bg-poe-border/40 rounded" /></td>
      <td className="px-3 py-2.5"><div className="h-3.5 w-32 bg-poe-border/40 rounded" /></td>
      <td className="px-3 py-2.5"><div className="h-4 w-16 bg-poe-border/40 rounded-full" /></td>
      <td className="px-3 py-2.5"><div className="h-3.5 w-16 bg-poe-border/40 rounded" /></td>
      <td className="px-3 py-2.5"><div className="h-3.5 w-14 bg-poe-border/40 rounded" /></td>
      <td className="px-3 py-2.5"><div className="h-4 w-16 bg-poe-border/40 rounded" /></td>
      <td className="px-3 py-2.5"><div className="h-3 w-12 bg-poe-border/40 rounded" /></td>
    </tr>
  );
}

export default function CurrencyPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { poeVersion, league } = useTrackerContext();

  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('chaosValue');
  const [sortDir, setSortDir] = useState('desc');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [totalCount, setTotalCount] = useState(0);

  const searchTimeout = useRef(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const supportedTypes = poeVersion === 'poe2' ? POE2_TYPES : POE1_TYPES;
    if (!supportedTypes.some((tab) => tab.value === selectedType)) {
      setSelectedType('');
    }
  }, [poeVersion, selectedType]);

  useEffect(() => {
    if (user) {
      loadPrices();
    }
  }, [user, league, selectedType, poeVersion]);

  const loadPrices = async (search = searchQuery) => {
    try {
      setLoading(true);
      const params = {
        poeVersion,
        league,
        limit: 500,
      };
      if (selectedType) params.type = selectedType;
      if (search) params.search = search;

      const response = await priceAPI.getCurrent(params);
      const data = response.data || {};
      setPrices(data.prices || []);
      setTotalCount(data.count || 0);
      setLastUpdated(data.updatedAt);
    } catch (error) {
      console.error('Price loading error:', error);
      toast.error('Failed to load prices');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = useCallback((value) => {
    setSearchQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      loadPrices(value);
    }, 300);
  }, [league, selectedType, poeVersion]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      await priceAPI.sync({ league, poeVersion });
      toast.success('Prices synced successfully');
      await loadPrices();
    } catch (error) {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedPrices = [...prices].sort((a, b) => {
    let aVal;
    let bVal;

    if (sortField === 'itemName') {
      aVal = (a.itemName || '').toLowerCase();
      bVal = (b.itemName || '').toLowerCase();
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }

    aVal = parseFloat(a[sortField]) || 0;
    bVal = parseFloat(b[sortField]) || 0;
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const SortHeader = ({ field, children }) => {
    const isActive = sortField === field;
    const ariaSort = isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
    return (
      <th
        className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-poe-gold select-none transition-colors"
        onClick={() => handleSort(field)}
        aria-sort={ariaSort}
        role="columnheader"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleSort(field);
          }
        }}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {isActive && (
            <span className="text-poe-gold" aria-hidden="true">{sortDir === 'asc' ? '▲' : '▼'}</span>
          )}
        </span>
      </th>
    );
  };

  const formatTimeAgo = (date) => {
    if (!date) return '-';
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-poe-dark">
        <div className="text-poe-gold text-xl animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-poe-dark">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Currency Prices</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="inline-flex rounded-full bg-sky-500/15 px-3 py-1 text-xs font-medium text-sky-300">
                {getPoeVersionLabel(poeVersion)}
              </span>
              <span className="inline-flex rounded-full bg-poe-card px-3 py-1 text-xs font-medium text-gray-300">
                {league}
              </span>
            </div>
          </div>

          <button
            onClick={handleSync}
            disabled={syncing}
            aria-label={syncing ? 'Syncing prices' : 'Sync prices from poe.ninja'}
            className="inline-flex items-center gap-2 px-4 py-2 bg-poe-gold text-poe-dark text-sm font-medium rounded-lg hover:bg-poe-gold/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-poe-gold focus-visible:ring-offset-2 focus-visible:ring-offset-poe-dark"
          >
            {syncing && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by item type">
            {(poeVersion === 'poe2' ? POE2_TYPES : POE1_TYPES).map((tab) => (
              <button
                key={tab.value}
                onClick={() => setSelectedType(tab.value)}
                role="tab"
                aria-selected={selectedType === tab.value}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-poe-gold ${
                  selectedType === tab.value
                    ? 'bg-poe-gold text-poe-dark shadow-sm shadow-poe-gold/20'
                    : 'bg-poe-card text-gray-400 hover:text-white border border-poe-border hover:border-poe-border/80'
                }`}
              >
                {tab.icon && <CurrencyIcon type={tab.icon} size={14} />}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="sm:ml-auto relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search items..."
              aria-label="Search currency items"
              className="w-full sm:w-64 bg-poe-card border border-poe-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:border-poe-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-poe-gold transition-colors"
            />
          </div>
        </div>

        <div className="bg-poe-card border border-poe-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" role="table">
              <thead className="bg-poe-darker border-b border-poe-border">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-10" scope="col">
                    #
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-10" scope="col">
                    <span className="sr-only">Icon</span>
                  </th>
                  <SortHeader field="itemName">Name</SortHeader>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider" scope="col">
                    Type
                  </th>
                  <SortHeader field="chaosValue">Chaos</SortHeader>
                  <SortHeader field="divineValue">Divine</SortHeader>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider" scope="col">
                    Trend
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider" scope="col">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-poe-border/50">
                {loading ? (
                  <>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <SkeletonRow key={i} />
                    ))}
                  </>
                ) : sortedPrices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <svg className="h-10 w-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                        <p className="text-gray-400 text-sm">
                          {searchQuery
                            ? 'No items found matching your search.'
                            : 'No price data available for this game and league. Click Sync to fetch prices.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedPrices.map((item, index) => (
                    <tr key={item.id} className="hover:bg-poe-border/20 transition-colors group">
                      <td className="px-3 py-2.5 text-xs text-gray-500 tabular-nums">
                        {index + 1}
                      </td>
                      <td className="px-3 py-2.5">
                        {item.iconUrl ? (
                          <img
                            src={item.iconUrl}
                            alt={item.itemName}
                            className="w-7 h-7 object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-7 h-7 bg-poe-border/30 rounded flex items-center justify-center">
                            <span className="text-gray-600 text-xs">?</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-white font-medium group-hover:text-poe-gold transition-colors">
                        {item.itemName}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-poe-border/30 text-gray-400 border border-poe-border/50">
                          {getItemTypeLabel(item.itemType)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <CurrencyValue value={item.chaosValue} type="chaos" size={14} className="text-sm tabular-nums" />
                      </td>
                      <td className="px-3 py-2.5">
                        {item.divineValue ? (
                          <CurrencyValue value={item.divineValue} type="divine" size={14} className="text-sm tabular-nums" />
                        ) : (
                          <span className="text-xs text-gray-600">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <SparklineChart data={item.sparklineData} />
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {formatTimeAgo(item.updatedAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && sortedPrices.length > 0 && (
            <div className="px-4 py-3 border-t border-poe-border flex items-center justify-between text-xs text-gray-500">
              <span>Showing {sortedPrices.length} of {totalCount} items</span>
              <span>Last synced: {formatTimeAgo(lastUpdated)}</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
