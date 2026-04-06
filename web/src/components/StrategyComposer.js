'use client';

import PoeChromeIcon from '@/components/PoeChromeIcon';
import { CurrencyValue } from '@/components/CurrencyIcon';
import { formatDate, formatDuration } from '@/lib/utils';

export default function StrategyComposer({
  t,
  sessions,
  selectedSessionIds,
  onToggleSession,
  form,
  onChange,
  onSubmit,
  submitting,
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="card">
        <div className="relative z-[1]">
          <p className="section-kicker inline-flex items-center gap-2">
            <PoeChromeIcon type="route" size={14} className="text-poe-gold/80" />
            <span>{t('strategies.formTitle')}</span>
          </p>
          <h2 className="panel-title mt-3">{t('strategies.formBody')}</h2>

          <div className="mt-6 grid gap-4">
            <div>
              <label className="section-kicker">{t('common.name')}</label>
              <input
                value={form.name}
                onChange={(event) => onChange('name', event.target.value)}
                className="input mt-2"
                placeholder={t('strategies.namePlaceholder')}
              />
            </div>

            <div>
              <label className="section-kicker">{t('common.description')}</label>
              <textarea
                value={form.description}
                onChange={(event) => onChange('description', event.target.value)}
                className="input mt-2 min-h-[140px]"
                placeholder={t('strategies.descriptionPlaceholder')}
              />
            </div>

            <div>
              <label className="section-kicker">{t('common.tags')}</label>
              <input
                value={form.tagInput}
                onChange={(event) => onChange('tagInput', event.target.value)}
                className="input mt-2"
                placeholder={t('strategies.tagsPlaceholder')}
              />
            </div>

            <button
              onClick={onSubmit}
              disabled={submitting || selectedSessionIds.length === 0 || !form.name.trim()}
              className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <PoeChromeIcon type="gate" size={15} />
              {submitting ? t('strategies.creating') : t('strategies.submit')}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="relative z-[1]">
          <p className="section-kicker inline-flex items-center gap-2">
            <PoeChromeIcon type="sessions" size={14} className="text-poe-gold/80" />
            <span>{t('strategies.selectionTitle')}</span>
          </p>
          <p className="mt-3 text-sm leading-6 text-poe-mist">
            {t('strategies.selectionBody')}
          </p>

          <div className="mt-5 max-h-[28rem] space-y-3 overflow-auto pr-1">
            {sessions.length === 0 && (
              <div className="rounded-2xl border border-dashed border-poe-border bg-[rgba(10,8,7,0.65)] px-5 py-6 text-sm text-poe-mist">
                {t('strategies.noCompletedRuns')}
              </div>
            )}

            {sessions.map((session) => {
              const selected = selectedSessionIds.includes(session.id);
              return (
                <button
                  key={session.id}
                  onClick={() => onToggleSession(session.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition-all ${
                    selected
                      ? 'border-poe-gold/50 bg-poe-gold/10 shadow-[0_0_0_1px_rgba(198,161,91,0.12)_inset]'
                      : 'border-poe-border bg-[rgba(12,10,9,0.72)] hover:border-poe-gold/25'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-display text-lg uppercase tracking-[0.08em] text-stone-100">
                        {session.mapName}
                      </p>
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-poe-mist">
                        {formatDate(session.startedAt)} • {formatDuration(session.durationSec)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="section-kicker">{t('common.profit')}</p>
                      <div className="mt-2 font-semibold text-emerald-300">
                        <CurrencyValue value={session.profitChaos} type="chaos" size={14} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
