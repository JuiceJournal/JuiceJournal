'use client';

import { useEffect, useMemo, useState } from 'react';
import Navbar from '@/components/Navbar';
import FarmRunFilters from '@/components/FarmRunFilters';
import FarmRunTable from '@/components/FarmRunTable';
import PoeChromeIcon from '@/components/PoeChromeIcon';
import { useI18n } from '@/hooks/useI18n';
import { useTrackerContext } from '@/hooks/useTrackerContext';
import { farmingHubAPI, getApiErrorMessage } from '@/lib/api';
import toast from 'react-hot-toast';

export default function FarmingHubPage() {
  const { t } = useI18n();
  const { poeVersion, league } = useTrackerContext();
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState([]);
  const [filters, setFilters] = useState({
    poeVersion,
    league,
    farmType: '',
    minProfitChaos: '',
    maxProfitChaos: ''
  });

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      poeVersion,
      league
    }));
  }, [poeVersion, league]);

  useEffect(() => {
    loadRuns();
  }, [filters]);

  const loadRuns = async () => {
    try {
      setLoading(true);
      const params = {
        poeVersion: filters.poeVersion,
        league: filters.league,
        limit: 50
      };

      ['farmType', 'minProfitChaos', 'maxProfitChaos'].forEach((key) => {
        if (filters[key]) {
          params[key] = filters[key];
        }
      });

      const response = await farmingHubAPI.getRuns(params);
      setRuns(response.data?.runs || []);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('farmingHub.loadError')));
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => ({
    runCount: runs.reduce((sum, run) => sum + (run.runCount || 0), 0),
    calculatedCount: runs.filter((run) => run.profitChaos !== null && run.profitChaos !== undefined).length,
    totalProfit: runs.reduce((sum, run) => sum + Number(run.profitChaos || 0), 0)
  }), [runs]);

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
                <PoeChromeIcon type="vault" size={14} className="text-poe-gold/80" />
                <span>{t('farmingHub.kicker')}</span>
              </p>
              <h1 className="mt-3 max-w-3xl font-display text-4xl uppercase leading-none text-stone-100 sm:text-5xl">
                {t('farmingHub.title')}
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-poe-mist">
                {t('farmingHub.body')}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.8)] p-4">
                <p className="section-kicker">{t('common.public')}</p>
                <p className="mt-3 text-3xl font-semibold text-stone-100">{runs.length}</p>
              </div>
              <div className="rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.8)] p-4">
                <p className="section-kicker">{t('common.runs')}</p>
                <p className="mt-3 text-3xl font-semibold text-poe-gold">{summary.runCount}</p>
              </div>
              <div className="rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.8)] p-4">
                <p className="section-kicker">{t('common.profit')}</p>
                <p className="mt-3 text-3xl font-semibold text-emerald-300">{summary.totalProfit.toFixed(1)}c</p>
              </div>
            </div>
          </div>
        </section>

        <div className="mb-8">
          <FarmRunFilters t={t} filters={filters} onChange={onFilterChange} />
        </div>

        {loading ? (
          <div className="card text-center text-poe-gold">{t('common.loading')}</div>
        ) : (
          <FarmRunTable runs={runs} t={t} />
        )}
      </main>
    </div>
  );
}
