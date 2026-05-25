'use client';

export default function FarmRunFilters({ t, filters, onChange }) {
  return (
    <div className="card">
      <div className="relative z-[1] grid gap-4 lg:grid-cols-6">
        <div>
          <label className="section-kicker">{t('context.selectVersion')}</label>
          <select
            className="input mt-2"
            value={filters.poeVersion}
            onChange={(event) => onChange('poeVersion', event.target.value)}
          >
            <option value="poe1">PoE 1</option>
            <option value="poe2">PoE 2</option>
          </select>
        </div>

        <div>
          <label className="section-kicker">{t('common.league')}</label>
          <input
            className="input mt-2"
            placeholder={t('context.leaguePlaceholder')}
            value={filters.league}
            onChange={(event) => onChange('league', event.target.value)}
          />
        </div>

        <div>
          <label className="section-kicker">{t('farmingHub.farmType')}</label>
          <input
            className="input mt-2"
            placeholder={t('farmingHub.farmTypePlaceholder')}
            value={filters.farmType}
            onChange={(event) => onChange('farmType', event.target.value)}
          />
        </div>

        <div>
          <label className="section-kicker">{t('farmingHub.minProfit')}</label>
          <input
            className="input mt-2"
            inputMode="decimal"
            placeholder="0"
            value={filters.minProfitChaos}
            onChange={(event) => onChange('minProfitChaos', event.target.value)}
          />
        </div>

        <div>
          <label className="section-kicker">{t('farmingHub.maxProfit')}</label>
          <input
            className="input mt-2"
            inputMode="decimal"
            placeholder="5000"
            value={filters.maxProfitChaos}
            onChange={(event) => onChange('maxProfitChaos', event.target.value)}
          />
        </div>

        <div className="flex items-end">
          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={() => {
              onChange('farmType', '');
              onChange('minProfitChaos', '');
              onChange('maxProfitChaos', '');
            }}
          >
            {t('common.reset')}
          </button>
        </div>
      </div>
    </div>
  );
}
