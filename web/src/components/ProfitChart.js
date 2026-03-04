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

export default function ProfitChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-poe-card rounded-lg p-6 h-80 flex items-center justify-center">
        <p className="text-gray-400">Veri bulunmuyor</p>
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
        <div className="bg-poe-darker border border-poe-border rounded-lg p-3">
          <p className="text-gray-300 text-sm mb-1">{label}</p>
          <p className="text-poe-gold font-medium">
            Kâr: {payload[0].value.toFixed(1)}c
          </p>
          <p className="text-gray-400 text-sm">
            {payload[0].payload.sessions} map
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-poe-card rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">
        Kâr Trendi (Son 7 Gün)
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis
              dataKey="date"
              stroke="#666"
              tick={{ fill: '#888', fontSize: 12 }}
            />
            <YAxis
              stroke="#666"
              tick={{ fill: '#888', fontSize: 12 }}
              tickFormatter={(value) => `${value}c`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="profit"
              stroke="#d4a853"
              strokeWidth={2}
              dot={{ fill: '#d4a853', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: '#d4a853' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
