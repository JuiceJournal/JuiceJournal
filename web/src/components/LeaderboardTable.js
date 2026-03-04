'use client';

import { formatChaos, formatNumber } from '@/lib/utils';

export default function LeaderboardTable({ data, currentUserId }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-poe-card rounded-lg p-8 text-center">
        <p className="text-gray-400">Henüz veri bulunmuyor</p>
      </div>
    );
  }

  const getRankStyle = (rank) => {
    switch (rank) {
      case 1:
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 2:
        return 'bg-gray-400/20 text-gray-300 border-gray-400/50';
      case 3:
        return 'bg-amber-700/20 text-amber-600 border-amber-700/50';
      default:
        return 'bg-poe-darker text-gray-400 border-poe-border';
    }
  };

  return (
    <div className="bg-poe-card rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-poe-darker text-gray-400 text-sm">
              <th className="text-center py-3 px-4 w-16">#</th>
              <th className="text-left py-3 px-4">Kullanici</th>
              <th className="text-center py-3 px-4">Map</th>
              <th className="text-right py-3 px-4">Toplam Kâr</th>
              <th className="text-right py-3 px-4">Ort. Kâr</th>
              <th className="text-right py-3 px-4">Saatlik</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-poe-border">
            {data.map((entry) => {
              const isCurrentUser = entry.userId === currentUserId;
              
              return (
                <tr
                  key={entry.rank}
                  className={`transition-colors ${
                    isCurrentUser ? 'bg-poe-gold/10' : 'hover:bg-poe-darker/50'
                  }`}
                >
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-full border text-sm font-bold ${getRankStyle(
                        entry.rank
                      )}`}
                    >
                      {entry.rank}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-medium text-white">
                      {entry.username}
                    </span>
                    {isCurrentUser && (
                      <span className="ml-2 text-xs text-poe-gold">(Siz)</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center text-gray-300">
                    {formatNumber(entry.sessionCount)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="font-medium text-poe-gold">
                      {formatChaos(entry.totalProfit)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-gray-300">
                    {formatChaos(entry.avgProfit)}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-300">
                    {formatChaos(entry.profitPerHour)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
