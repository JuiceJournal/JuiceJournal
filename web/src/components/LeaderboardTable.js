'use client';

import { formatNumber } from '@/lib/utils';
import { CurrencyValue } from '@/components/CurrencyIcon';

export default function LeaderboardTable({ data, currentUserId }) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-poe-border bg-[rgba(11,9,8,0.6)] p-10 text-center">
        <p className="font-display text-xl uppercase tracking-[0.14em] text-stone-200">No rankings yet</p>
        <p className="mt-3 text-sm text-poe-mist">This ladder will populate once enough league sessions are completed.</p>
      </div>
    );
  }

  const getRankStyle = (rank) => {
    switch (rank) {
      case 1:
        return 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300';
      case 2:
        return 'border-stone-400/40 bg-stone-400/10 text-stone-200';
      case 3:
        return 'border-amber-700/40 bg-amber-700/10 text-amber-300';
      default:
        return 'border-poe-border bg-[rgba(255,255,255,0.03)] text-poe-mist';
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-poe-border bg-[rgba(12,10,9,0.62)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-poe-border bg-[rgba(255,255,255,0.02)] text-[0.68rem] uppercase tracking-[0.16em] text-poe-mist">
              <th className="px-4 py-4 text-center font-semibold w-20">Rank</th>
              <th className="px-4 py-4 text-left font-semibold">User</th>
              <th className="px-4 py-4 text-center font-semibold">Maps</th>
              <th className="px-4 py-4 text-right font-semibold">Total Profit</th>
              <th className="px-4 py-4 text-right font-semibold">Avg. Profit</th>
              <th className="px-4 py-4 text-right font-semibold">Hourly</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-poe-border/70">
            {data.map((entry) => {
              const isCurrentUser = entry.userId === currentUserId;

              return (
                <tr
                  key={entry.rank}
                  className={`transition-colors ${isCurrentUser ? 'bg-poe-gold/8' : 'hover:bg-[rgba(255,255,255,0.03)]'}`}
                >
                  <td className="px-4 py-4 text-center">
                    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold ${getRankStyle(entry.rank)}`}>
                      {entry.rank}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-display text-lg uppercase tracking-[0.08em] text-stone-100">{entry.username}</p>
                    {isCurrentUser && (
                      <span className="mt-1 inline-flex text-xs font-semibold uppercase tracking-[0.14em] text-poe-gold">(You)</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center text-sm font-semibold text-stone-300">
                    {formatNumber(entry.sessionCount)}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="font-semibold text-poe-gold">
                      <CurrencyValue value={entry.totalProfit} type="chaos" size={14} />
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right text-stone-300">
                    <CurrencyValue value={entry.avgProfit} type="chaos" size={14} />
                  </td>
                  <td className="px-4 py-4 text-right text-stone-300">
                    <CurrencyValue value={entry.profitPerHour} type="chaos" size={14} />
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
