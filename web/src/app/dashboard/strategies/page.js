'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { useTrackerContext } from '@/hooks/useTrackerContext';
import Navbar from '@/components/Navbar';
import PoeChromeIcon from '@/components/PoeChromeIcon';
import StrategyComposer from '@/components/StrategyComposer';
import StrategyPreviewCard from '@/components/StrategyPreviewCard';
import { getApiErrorMessage, sessionAPI, strategyAPI } from '@/lib/api';
import { parseTagInput } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function StrategiesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const { poeVersion, league } = useTrackerContext();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState([]);
  const [form, setForm] = useState({
    name: '',
    description: '',
    tagInput: ''
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (user) {
      loadPageData();
    }
  }, [user, authLoading, router, poeVersion, league]);

  const loadPageData = async () => {
    try {
      setLoading(true);
      const [sessionResponse, strategyResponse] = await Promise.all([
        sessionAPI.getAll({
          status: 'completed',
          poeVersion,
          league,
          limit: 100,
        }),
        strategyAPI.getMine({ poeVersion, league })
      ]);

      setSessions(sessionResponse.data?.sessions || []);
      setStrategies(strategyResponse.data?.strategies || []);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('strategies.loadError')));
    } finally {
      setLoading(false);
    }
  };

  const selectedSessions = useMemo(
    () => sessions.filter((session) => selectedSessionIds.includes(session.id)),
    [sessions, selectedSessionIds]
  );

  const preview = useMemo(() => {
    const tags = parseTagInput(form.tagInput);
    if (selectedSessions.length === 0) {
      return null;
    }

    const totalProfitChaos = selectedSessions.reduce((sum, session) => sum + parseFloat(session.profitChaos || 0), 0);
    const totalDurationSec = selectedSessions.reduce((sum, session) => sum + parseInt(session.durationSec || 0, 10), 0);
    const latestRun = selectedSessions.reduce((latest, session) => {
      if (!latest) {
        return session;
      }
      return new Date(session.startedAt) > new Date(latest.startedAt) ? session : latest;
    }, null);

    return {
      name: form.name.trim() || t('strategies.namePlaceholder'),
      description: form.description.trim(),
      mapName: selectedSessions[0].mapName,
      league,
      poeVersion,
      tags,
      metrics: {
        runCount: selectedSessions.length,
        avgProfitChaos: totalProfitChaos / selectedSessions.length,
        avgProfitPerHour: totalDurationSec > 0 ? totalProfitChaos / (totalDurationSec / 3600) : 0,
        lastRunAt: latestRun?.startedAt || null
      },
      trend: []
    };
  }, [form.description, form.name, form.tagInput, league, poeVersion, selectedSessions, t]);

  const toggleSession = (sessionId) => {
    setSelectedSessionIds((current) => (
      current.includes(sessionId)
        ? current.filter((id) => id !== sessionId)
        : [...current, sessionId]
    ));
  };

  const handleFormChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleCreateStrategy = async () => {
    try {
      setSubmitting(true);
      await strategyAPI.create({
        name: form.name.trim(),
        description: form.description.trim(),
        tags: parseTagInput(form.tagInput),
        sessionIds: selectedSessionIds
      });

      setForm({ name: '', description: '', tagInput: '' });
      setSelectedSessionIds([]);
      toast.success(t('strategies.createSuccess'));
      await loadPageData();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('strategies.createError')));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePublish = async (strategyId) => {
    try {
      await strategyAPI.publish(strategyId);
      toast.success(t('strategies.publishSuccess'));
      await loadPageData();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('strategies.publishError')));
    }
  };

  const handleUnpublish = async (strategyId) => {
    try {
      await strategyAPI.unpublish(strategyId);
      toast.success(t('strategies.unpublishSuccess'));
      await loadPageData();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('strategies.unpublishError')));
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-poe-gold text-xl">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-poe-dark">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="card mb-8">
          <div className="relative z-[1] flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="section-kicker inline-flex items-center gap-2">
                <PoeChromeIcon type="route" size={14} className="text-poe-gold/80" />
                <span>{t('strategies.kicker')}</span>
              </p>
              <h1 className="mt-3 font-display text-4xl uppercase leading-none text-stone-100">
                {t('strategies.title')}
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-poe-mist">
                {t('strategies.body')}
              </p>
            </div>

            <Link
              href="/strategies/public"
              className="inline-flex items-center gap-2 rounded-full border border-poe-border bg-[rgba(28,23,20,0.68)] px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-poe-gold transition-colors hover:border-poe-gold/30 hover:text-amber-200"
            >
              <PoeChromeIcon type="gate" size={14} />
              <span>{t('strategies.publicCta')}</span>
            </Link>
          </div>
        </section>

        <StrategyComposer
          t={t}
          sessions={sessions}
          selectedSessionIds={selectedSessionIds}
          onToggleSession={toggleSession}
          form={form}
          onChange={handleFormChange}
          onSubmit={handleCreateStrategy}
          submitting={submitting}
        />

        {preview && (
          <div className="mt-8">
            <StrategyPreviewCard strategy={preview} t={t} compact />
          </div>
        )}

        <section className="mt-8 card">
          <div className="relative z-[1]">
            <p className="section-kicker inline-flex items-center gap-2">
              <PoeChromeIcon type="sessions" size={14} className="text-poe-gold/80" />
              <span>{t('strategies.draftsTitle')}</span>
            </p>
            <h2 className="panel-title mt-3">{t('strategies.draftsBody')}</h2>

            {strategies.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-poe-border bg-[rgba(10,8,7,0.65)] px-6 py-10 text-center">
                <p className="font-display text-xl uppercase tracking-[0.14em] text-stone-200">
                  {t('strategies.emptyTitle')}
                </p>
                <p className="mt-3 text-sm text-poe-mist">
                  {t('strategies.emptyBody')}
                </p>
              </div>
            ) : (
              <div className="mt-6 grid gap-6">
                {strategies.map((strategy) => (
                  <div key={strategy.id} className="rounded-3xl border border-poe-border bg-[rgba(12,10,9,0.72)] p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <span className={`context-chip ${strategy.visibility === 'public'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                          }`}>
                            {strategy.visibility === 'public' ? t('common.public') : t('common.private')}
                          </span>
                        </div>
                        <h3 className="mt-4 font-display text-2xl uppercase tracking-[0.12em] text-stone-100">
                          {strategy.name}
                        </h3>
                        <p className="mt-3 max-w-3xl text-sm leading-6 text-poe-mist">
                          {strategy.description || t('common.none')}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {strategy.tags.map((tag) => (
                            <span key={tag} className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-poe-border bg-[rgba(255,255,255,0.03)] p-4">
                          <p className="section-kicker">{t('publicStrategies.table.avgProfit')}</p>
                          <p className="mt-3 text-lg font-semibold text-emerald-300">{strategy.metrics.avgProfitChaos.toFixed(1)}c</p>
                        </div>
                        <div className="rounded-2xl border border-poe-border bg-[rgba(255,255,255,0.03)] p-4">
                          <p className="section-kicker">{t('common.runs')}</p>
                          <p className="mt-3 text-lg font-semibold text-stone-100">{strategy.metrics.runCount}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                      {strategy.visibility === 'public' ? (
                        <button onClick={() => handleUnpublish(strategy.id)} className="btn btn-secondary">
                          <PoeChromeIcon type="gate" size={14} />
                          {t('common.unpublish')}
                        </button>
                      ) : (
                        <button onClick={() => handlePublish(strategy.id)} className="btn btn-primary">
                          <PoeChromeIcon type="gate" size={14} />
                          {t('common.publish')}
                        </button>
                      )}

                      {strategy.visibility === 'public' && (
                        <Link
                          href={`/strategies/public/${strategy.slug}`}
                          className="btn btn-secondary"
                        >
                          <PoeChromeIcon type="route" size={14} />
                          {t('publicStrategies.table.details')}
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
