'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import Navbar from '@/components/Navbar';
import CurrencyIcon, { CurrencyValue } from '@/components/CurrencyIcon';
import SparklineChart from '@/components/SparklineChart';
import { priceAPI } from '@/lib/api';
import { getItemTypeLabel } from '@/lib/utils';
import toast from 'react-hot-toast';

// PoE 1 category types with representative icons
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

// PoE 2 category types with representative icons
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

export default function CurrencyPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('chaosValue');
  const [sortDir, setSortDir] = useState('desc');
  const [league, setLeague] = useState('');
  const [leagues, setLeagues] = useState([]);
  const [poeVersion, setPoeVersion] = useState('poe1');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [totalCount, setTotalCount] = useState(0);

  const searchTimeout = useRef(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Load leagues when version changes
  useEffect(() => {
    if (user) {
      loadLeagues();
    }
  }, [user, poeVersion]);

  // Load prices when filters change
  useEffect(() => {
    if (user) {
      loadPrices();
    }
  }, [user, league, selectedType, poeVersion]);

  const loadLeagues = async () => {
    try {
      const response = await priceAPI.getLeagues({ poeVersion });
      const leagueList = response.data?.leagues || [];
      setLeagues(leagueList);
      if (leagueList.length > 0 && !leagueList.includes(league)) {
        setLeague(leagueList[0]);
      }
    } catch (error) {
      console.error('League loading error:', error);
    }
  };

  const loadPrices = async (search = searchQuery) => {
    try {
      setLoading(true);
      const params = {
        poeVersion,
        limit: 500,
      };
      if (league) params.league = league;
      if (selectedType) params.type = selectedType;
      if (search) params.search = search;

      const response = await priceAPI.getCurrent(params);
      const data = response.data || {};
      setPrices(data.prices || []);
      setTotalCount(data.count || 0);
      setLastUpdated(data.updatedAt);
      if (data.league && !league) {
        setLeague(data.league);
      }
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

  const handleVersionChange = (version) => {
    setPoeVersion(version);
    setLeague('');
    setSelectedType('');
    setSearchQuery('');
  };

  // Client-side sort
  const sortedPrices = [...prices].sort((a, b) => {
    let aVal, bVal;
    if (sortField === 'itemName') {
      aVal = (a.itemName || '').toLowerCase();
      bVal = (b.itemName || '').toLowerCase();
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    aVal = parseFloat(a[sortField]) || 0;
    bVal = parseFloat(b[sortField]) || 0;
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const SortHeader = ({ field, children }) => (
    <th
      className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-poe-gold select-none"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortField === field && (
          <span className="text-poe-gold">{sortDir === 'asc' ? '▲' : '▼'}</span>
        )}
      </span>
    </th>
  );

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-poe-gold text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-poe-dark">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
          <h1 className="text-2xl font-bold text-white">Currency Prices</h1>

          <div className="flex items-center gap-3 flex-wrap">
            {/* PoE Version Toggle */}
            <div className="flex rounded-lg overflow-hidden border border-poe-border">
              <button
                onClick={() => handleVersionChange('poe1')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  poeVersion === 'poe1'
                    ? 'bg-poe-gold text-poe-dark'
                    : 'bg-poe-card text-gray-400 hover:text-white'
                }`}
              >
                PoE 1
              </button>
              <button
                onClick={() => handleVersionChange('poe2')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  poeVersion === 'poe2'
                    ? 'bg-poe-gold text-poe-dark'
                    : 'bg-poe-card text-gray-400 hover:text-white'
                }`}
              >
                PoE 2
              </button>
            </div>

            {/* League Select */}
            {leagues.length > 0 && (
              <select
                value={league}
                onChange={(e) => setLeague(e.target.value)}
                className="bg-poe-card border border-poe-border rounded-lg px-3 py-1.5 text-sm text-white focus:border-poe-gold focus:outline-none"
              >
                {leagues.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            )}

            {/* Sync Button */}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-4 py-1.5 bg-poe-gold text-poe-dark text-sm font-medium rounded-lg hover:bg-poe-gold/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing ? 'Syncing...' : 'Sync'}
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {/* Type Tabs */}
          <div className="flex flex-wrap gap-1">
            {(poeVersion === 'poe2' ? POE2_TYPES : POE1_TYPES).map((tab) => (
              <button
                key={tab.value}
                onClick={() => setSelectedType(tab.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  selectedType === tab.value
                    ? 'bg-poe-gold text-poe-dark'
                    : 'bg-poe-card text-gray-400 hover:text-white border border-poe-border'
                }`}
              >
                {tab.icon && <CurrencyIcon type={tab.icon} size={14} />}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="sm:ml-auto">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search items..."
              className="w-full sm:w-64 bg-poe-card border border-poe-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:border-poe-gold focus:outline-none"
            />
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-poe-card border border-poe-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-poe-darker border-b border-poe-border">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-10">
                    #
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-10"></th>
                  <SortHeader field="itemName">Name</SortHeader>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Type
                  </th>
                  <SortHeader field="chaosValue">Chaos</SortHeader>
                  <SortHeader field="divineValue">Divine</SortHeader>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Trend
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-poe-border/50">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-gray-400">
                      Loading prices...
                    </td>
                  </tr>
                ) : sortedPrices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-gray-400">
                      {searchQuery
                        ? 'No items found matching your search.'
                        : 'No price data available. Click Sync to fetch prices.'}
                    </td>
                  </tr>
                ) : (
                  sortedPrices.map((item, index) => (
                    <tr
                      key={item.id}
                      className="hover:bg-poe-border/20 transition-colors"
                    >
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {index + 1}
                      </td>
                      <td className="px-3 py-2">
                        {item.iconUrl ? (
                          <img
                            src={item.iconUrl}
                            alt=""
                            className="w-6 h-6 object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-6 h-6 bg-poe-border/50 rounded" />
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-white font-medium">
                        {item.itemName}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-poe-border/50 text-gray-300">
                          {getItemTypeLabel(item.itemType)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <CurrencyValue
                          value={item.chaosValue}
                          type="chaos"
                          size={14}
                          className="text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        {item.divineValue ? (
                          <CurrencyValue
                            value={item.divineValue}
                            type="divine"
                            size={14}
                            className="text-sm"
                          />
                        ) : (
                          <span className="text-xs text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <SparklineChart data={item.sparklineData} />
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {formatTimeAgo(item.updatedAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
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
