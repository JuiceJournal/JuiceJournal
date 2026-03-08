'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { useTrackerContext } from '@/hooks/useTrackerContext';
import Navbar from '@/components/Navbar';
import PoeChromeIcon from '@/components/PoeChromeIcon';
import CurrencyIcon, { CurrencyValue } from '@/components/CurrencyIcon';
import SparklineChart from '@/components/SparklineChart';
import { getApiErrorMessage, priceAPI } from '@/lib/api';
import { getCurrentLocale, getLocaleTag, translate } from '@/lib/i18n';
import { getItemTypeLabel, getPoeVersionLabel } from '@/lib/utils';
import toast from 'react-hot-toast';

const POE1_TYPES = [
  { value: '', labelKey: 'common.all', icon: null },
  { value: 'currency', itemType: 'currency', icon: 'chaos' },
  { value: 'fragment', itemType: 'fragment', icon: 'vaal' },
  { value: 'scarab', itemType: 'scarab', icon: 'chance' },
  { value: 'map', itemType: 'map', icon: 'alchemy' },
  { value: 'divination_card', itemType: 'divination_card', icon: 'divine' },
  { value: 'gem', itemType: 'gem', icon: 'gcp' },
  { value: 'unique', itemType: 'unique', icon: 'exalted' },
  { value: 'oil', itemType: 'oil', icon: 'blessed' },
  { value: 'incubator', itemType: 'incubator', icon: 'regret' },
  { value: 'delirium_orb', itemType: 'delirium_orb', icon: 'chromatic' },
  { value: 'catalyst', itemType: 'catalyst', icon: 'scouring' },
  { value: 'other', itemType: 'other', icon: 'alteration' },
];

const POE2_TYPES = [
  { value: '', labelKey: 'common.all', icon: null },
  { value: 'currency', itemType: 'currency', icon: 'exalted' },
  { value: 'fragment', itemType: 'fragment', icon: 'vaal' },
  { value: 'scarab', itemType: 'scarab', icon: 'chance' },
  { value: 'map', itemType: 'map', icon: 'alchemy' },
  { value: 'divination_card', itemType: 'divination_card', icon: 'divine' },
  { value: 'gem', itemType: 'gem', icon: 'gcp' },
  { value: 'unique', itemType: 'unique', icon: 'mirror' },
  { value: 'catalyst', itemType: 'catalyst', icon: 'scouring' },
  { value: 'other', itemType: 'other', icon: 'alteration' },
];

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-4"><div className="h-3 w-5 rounded bg-poe-border/40" /></td>
      <td className="px-4 py-4"><div className="h-8 w-8 rounded-xl bg-poe-border/40" /></td>
      <td className="px-4 py-4"><div className="h-4 w-40 rounded bg-poe-border/40" /></td>
      <td className="px-4 py-4"><div className="h-4 w-20 rounded-full bg-poe-border/40" /></td>
      <td className="px-4 py-4"><div className="h-4 w-20 rounded bg-poe-border/40" /></td>
      <td className="px-4 py-4"><div className="h-4 w-20 rounded bg-poe-border/40" /></td>
      <td className="px-4 py-4"><div className="h-4 w-16 rounded bg-poe-border/40" /></td>
      <td className="px-4 py-4"><div className="h-4 w-14 rounded bg-poe-border/40" /></td>
    </tr>
  );
}

export default function CurrencyPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t } = useI18n();
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
      toast.error(getApiErrorMessage(error, t('toast.pricesLoadError')));
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
      toast.success(t('toast.pricesSynced'));
      await loadPrices();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('toast.pricesSyncError')));
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
        className="px-4 py-4 text-left text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-poe-mist cursor-pointer hover:text-poe-gold select-none transition-colors"
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
    const formatter = new Intl.RelativeTimeFormat(getLocaleTag(getCurrentLocale()), { numeric: 'auto' });
    if (mins < 1) return formatter.format(0, 'minute');
    if (mins < 60) return formatter.format(-mins, 'minute');
    const hours = Math.floor(mins / 60);
    if (hours < 24) return formatter.format(-hours, 'hour');
    return formatter.format(-Math.floor(hours / 24), 'day');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-poe-dark">
      <div className="text-poe-gold text-xl animate-pulse">{t('common.loading')}</div>
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
                <PoeChromeIcon type="market" size={14} className="text-poe-gold/80" />
                <span>{t('currency.kicker')}</span>
              </p>
              <h1 className="mt-3 font-display text-4xl uppercase leading-none text-stone-100">
                {t('currency.title')}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-poe-mist">
                {t('currency.body')}
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

            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn btn-primary disabled:opacity-50"
            >
              <PoeChromeIcon type="market" size={16} />
              {syncing ? t('common.loading') : t('currency.syncPrices')}
            </button>
          </div>
        </section>

        <section className="card mb-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('common.type')}>
              {(poeVersion === 'poe2' ? POE2_TYPES : POE1_TYPES).map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setSelectedType(tab.value)}
                  role="tab"
                  aria-selected={selectedType === tab.value}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] transition-colors ${
                    selectedType === tab.value
                      ? 'border-poe-gold/50 bg-poe-gold/15 text-poe-gold'
                      : 'border-poe-border bg-[rgba(24,19,16,0.68)] text-stone-300 hover:border-poe-gold/25 hover:text-stone-100'
                  }`}
                >
                  {tab.icon && <CurrencyIcon type={tab.icon} size={14} />}
                  {tab.labelKey ? t(tab.labelKey) : getItemTypeLabel(tab.itemType)}
                </button>
              ))}
            </div>

            <div className="relative ml-auto w-full sm:w-72">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-poe-mist"
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
                placeholder={t('currency.searchItems')}
                aria-label={t('currency.searchItems')}
                className="input pl-9 text-sm"
              />
            </div>
          </div>
        </section>

        <div className="overflow-hidden rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.62)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]" role="table">
              <thead className="border-b border-poe-border bg-[rgba(255,255,255,0.02)]">
                <tr>
                  <th className="px-4 py-4 text-left text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-poe-mist w-12" scope="col">
                    #
                  </th>
                  <th className="px-4 py-4 text-left text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-poe-mist w-12" scope="col">
                    <span className="sr-only">{t('common.icon')}</span>
                  </th>
                  <SortHeader field="itemName">{t('common.name')}</SortHeader>
                  <th className="px-4 py-4 text-left text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-poe-mist" scope="col">
                    {t('common.type')}
                  </th>
                  <SortHeader field="chaosValue">{t('currency.chaos')}</SortHeader>
                  <SortHeader field="divineValue">{t('currency.divine')}</SortHeader>
                  <th className="px-4 py-4 text-left text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-poe-mist" scope="col">
                    {t('common.trend')}
                  </th>
                  <th className="px-4 py-4 text-left text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-poe-mist" scope="col">
                    {t('common.updated')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-poe-border/70">
                {loading ? (
                  <>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <SkeletonRow key={i} />
                    ))}
                  </>
                ) : sortedPrices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <p className="font-display text-xl uppercase tracking-[0.14em] text-stone-200">
                        {searchQuery ? t('currency.noMatchesTitle') : t('currency.noDataTitle')}
                      </p>
                      <p className="mt-3 text-sm text-poe-mist">
                        {searchQuery
                          ? t('currency.noMatchesBody')
                          : t('currency.noDataBody')}
                      </p>
                    </td>
                  </tr>
                ) : (
                  sortedPrices.map((item, index) => (
                    <tr key={item.id} className="transition-colors hover:bg-[rgba(255,255,255,0.03)]">
                      <td className="px-4 py-4 text-xs text-poe-mist tabular-nums">
                        {index + 1}
                      </td>
                      <td className="px-4 py-4">
                        {item.iconUrl ? (
                          <img
                            src={item.iconUrl}
                            alt={item.itemName}
                            className="h-8 w-8 rounded-xl border border-poe-border/70 bg-[rgba(255,255,255,0.02)] object-contain p-1"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-poe-border/70 bg-[rgba(255,255,255,0.02)] text-xs text-poe-mist">
                            ?
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-stone-100">
                        {item.itemName}
                      </td>
                      <td className="px-4 py-4">
                        <span className="context-chip border-poe-border bg-[rgba(255,255,255,0.03)] text-stone-300">
                          {getItemTypeLabel(item.itemType)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <CurrencyValue value={item.chaosValue} type="chaos" size={14} className="text-sm font-semibold text-stone-200 tabular-nums" />
                      </td>
                      <td className="px-4 py-4">
                        {item.divineValue ? (
                          <CurrencyValue value={item.divineValue} type="divine" size={14} className="text-sm font-semibold text-stone-200 tabular-nums" />
                        ) : (
                          <span className="text-xs text-poe-mist">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <SparklineChart data={item.sparklineData} />
                      </td>
                      <td className="px-4 py-4 text-xs uppercase tracking-[0.14em] text-poe-mist">
                        {formatTimeAgo(item.updatedAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && sortedPrices.length > 0 && (
            <div className="flex items-center justify-between border-t border-poe-border px-4 py-4 text-xs uppercase tracking-[0.14em] text-poe-mist">
              <span>{t('currency.showing', { shown: sortedPrices.length, total: totalCount })}</span>
              <span>{t('currency.lastSynced', { time: formatTimeAgo(lastUpdated) })}</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
