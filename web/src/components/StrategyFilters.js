'use client';

export default function StrategyFilters({
  t,
  filters,
  onChange,
  yearOptions,
}) {
  return (
    <div className="card">
      <div className="relative z-[1] grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label className="section-kicker">{t('common.search')}</label>
          <input
            className="input mt-2"
            placeholder={t('publicStrategies.searchPlaceholder')}
            value={filters.search}
            onChange={(event) => onChange('search', event.target.value)}
          />
        </div>

        <div>
          <label className="section-kicker">{t('common.tags')}</label>
          <input
            className="input mt-2"
            placeholder={t('publicStrategies.tagPlaceholder')}
            value={filters.tag}
            onChange={(event) => onChange('tag', event.target.value)}
          />
        </div>

        <div>
          <label className="section-kicker">{t('common.author')}</label>
          <input
            className="input mt-2"
            placeholder={t('publicStrategies.authorPlaceholder')}
            value={filters.author}
            onChange={(event) => onChange('author', event.target.value)}
          />
        </div>

        <div>
          <label className="section-kicker">{t('common.map')}</label>
          <input
            className="input mt-2"
            placeholder={t('publicStrategies.mapPlaceholder')}
            value={filters.mapName}
            onChange={(event) => onChange('mapName', event.target.value)}
          />
        </div>

        <div>
          <label className="section-kicker">{t('common.year')}</label>
          <select
            className="input mt-2"
            value={filters.year}
            onChange={(event) => onChange('year', event.target.value)}
          >
            <option value="">{t('common.all')}</option>
            {yearOptions.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="section-kicker">{t('common.type')}</label>
          <select
            className="input mt-2"
            value={filters.sort}
            onChange={(event) => onChange('sort', event.target.value)}
          >
            <option value="newest">{t('publicStrategies.sortNewest')}</option>
            <option value="most_profitable">{t('publicStrategies.sortProfit')}</option>
            <option value="best_profit_per_hour">{t('publicStrategies.sortHourly')}</option>
            <option value="most_runs">{t('publicStrategies.sortRuns')}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
