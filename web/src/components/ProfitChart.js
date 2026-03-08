'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatShortDate } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

export default function ProfitChart({ data }) {
  const { t } = useI18n();

  if (!data || data.length === 0) {
    return (
      <div className="card h-80 flex items-center justify-center">
        <div className="text-center">
          <p className="section-kicker">{t('chart.title')}</p>
          <p className="mt-3 text-gray-400">{t('chart.empty')}</p>
        </div>
      </div>
    );
  }

  const chartData = data.map((item) => ({
    date: formatShortDate(item.date),
    profit: parseFloat(item.totalProfit) || 0,
    sessions: parseInt(item.sessionCount) || 0,
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-2xl border border-poe-border bg-[rgba(14,11,10,0.96)] px-4 py-3 shadow-[0_20px_40px_rgba(0,0,0,0.45)]">
          <p className="section-kicker mb-2">{label}</p>
          <p className="text-poe-gold font-semibold">
            {t('chart.tooltipProfit', { value: payload[0].value.toFixed(1) })}
          </p>
          <p className="mt-1 text-sm text-gray-400">
            {t('chart.tooltipMaps', { count: payload[0].payload.sessions })}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card">
      <p className="section-kicker">{t('chart.kicker')}</p>
      <h3 className="panel-title">
        {t('chart.title')}
      </h3>
      <p className="mb-5 max-w-xl text-sm text-poe-mist">
        {t('dashboard.averageRouteBody')}
      </p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <defs>
              <linearGradient id="profitStroke" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#7f3326" />
                <stop offset="45%" stopColor="#c6a15b" />
                <stop offset="100%" stopColor="#f2d18d" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 10" stroke="rgba(198, 161, 91, 0.12)" vertical={false} />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              stroke="#7f7466"
              tick={{ fill: '#9b8b76', fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              stroke="#7f7466"
              tick={{ fill: '#9b8b76', fontSize: 12 }}
              tickFormatter={(value) => `${value}c`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="profit"
              stroke="url(#profitStroke)"
              strokeWidth={3}
              dot={{ fill: '#120f0d', stroke: '#c6a15b', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 7, fill: '#f2d18d', stroke: '#120f0d', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
