'use client';

import { useEffect, useMemo, useState } from 'react';
import Navbar from '@/components/Navbar';
import PoeChromeIcon from '@/components/PoeChromeIcon';
import StrategyFilters from '@/components/StrategyFilters';
import StrategyTable from '@/components/StrategyTable';
import { useI18n } from '@/hooks/useI18n';
import { useTrackerContext } from '@/hooks/useTrackerContext';
import { getApiErrorMessage, publicStrategyAPI } from '@/lib/api';
import toast from 'react-hot-toast';

export default function PublicStrategiesPage() {
  const { t } = useI18n();
  const { poeVersion, league } = useTrackerContext();
  const [loading, setLoading] = useState(true);
  const [strategies, setStrategies] = useState([]);
  const [filters, setFilters] = useState({
    poeVersion,
    league,
    search: '',
    tag: '',
    author: '',
    mapName: '',
    year: '',
    sort: 'most_profitable'
  });

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      poeVersion,
      league
    }));
  }, [poeVersion, league]);

  useEffect(() => {
    loadStrategies();
  }, [filters]);

  const loadStrategies = async () => {
    try {
      setLoading(true);
      const params = {
        poeVersion: filters.poeVersion,
        league: filters.league,
        sort: filters.sort
      };

      ['search', 'tag', 'author', 'mapName', 'year'].forEach((key) => {
        if (filters[key]) {
          params[key] = filters[key];
        }
      });

      const response = await publicStrategyAPI.getAll(params);
      setStrategies(response.data?.strategies || []);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('strategies.loadError')));
    } finally {
      setLoading(false);
    }
  };

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from(new Set([
      currentYear,
      currentYear - 1,
      currentYear - 2,
      ...strategies
        .map((strategy) => {
          const value = strategy.metrics?.lastRunAt;
          return value ? new Date(value).getFullYear() : null;
        })
        .filter(Boolean)
    ])).sort((left, right) => right - left);
  }, [strategies]);

  const onFilterChange = (key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: value
    }));
  };

  return (
    <div className="min-h-screen bg-poe-dark">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="card mb-8">
          <div className="relative z-[1] grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
            <div>
              <p className="section-kicker inline-flex items-center gap-2">
                <PoeChromeIcon type="gate" size={14} className="text-poe-gold/80" />
                <span>{t('publicStrategies.kicker')}</span>
              </p>
              <h1 className="mt-3 max-w-3xl font-display text-4xl uppercase leading-none text-stone-100 sm:text-5xl">
                {t('publicStrategies.title')}
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-poe-mist">
                {t('publicStrategies.body')}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.8)] p-4">
                <p className="section-kicker">{t('common.public')}</p>
                <p className="mt-3 text-3xl font-semibold text-stone-100">{strategies.length}</p>
              </div>
              <div className="rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.8)] p-4">
                <p className="section-kicker">{t('common.runs')}</p>
                <p className="mt-3 text-3xl font-semibold text-poe-gold">
                  {strategies.reduce((sum, strategy) => sum + (strategy.metrics?.runCount || 0), 0)}
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="mb-8">
          <StrategyFilters
            t={t}
            filters={filters}
            onChange={onFilterChange}
            yearOptions={yearOptions}
          />
        </div>

        {loading ? (
          <div className="card text-center text-poe-gold">{t('common.loading')}</div>
        ) : (
          <StrategyTable strategies={strategies} t={t} />
        )}
      </main>
    </div>
  );
}
