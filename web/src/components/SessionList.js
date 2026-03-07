'use client';

import Link from 'next/link';
import {
  formatDate,
  formatTime,
  formatDuration,
  getProfitColorClass,
  getPoeVersionLabel,
  getStatusColorClass,
  getStatusLabel,
} from '@/lib/utils';
import { CurrencyValue } from '@/components/CurrencyIcon';

export default function SessionList({ sessions, showActions = false, onEndSession }) {
  if (!sessions || sessions.length === 0) {
    return (
      <div className="bg-poe-card rounded-lg p-8 text-center">
        <p className="text-gray-400">No sessions yet</p>
      </div>
    );
  }

  return (
    <div className="bg-poe-card rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-poe-darker text-gray-400 text-sm">
              <th className="text-left py-3 px-4">Map</th>
              <th className="text-left py-3 px-4">Tier</th>
              <th className="text-left py-3 px-4">Started</th>
              <th className="text-left py-3 px-4">Duration</th>
              <th className="text-right py-3 px-4">Profit</th>
              <th className="text-center py-3 px-4">Status</th>
              {showActions && <th className="text-center py-3 px-4">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-poe-border">
            {sessions.map((session) => (
              <tr key={session.id} className="hover:bg-poe-darker/50 transition-colors">
                <td className="py-3 px-4">
                  <span className="font-medium text-white">{session.mapName}</span>
                  {session.mapType && (
                    <span className="text-gray-500 text-sm ml-2">
                      ({session.mapType})
                    </span>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-flex rounded-full bg-sky-500/15 px-2 py-1 text-xs font-medium text-sky-300">
                      {getPoeVersionLabel(session.poeVersion)}
                    </span>
                    <span className="inline-flex rounded-full bg-poe-border px-2 py-1 text-xs font-medium text-gray-300">
                      {session.league}
                    </span>
                  </div>
                </td>
                <td className="py-3 px-4 text-gray-300">
                  {session.mapTier || '-'}
                </td>
                <td className="py-3 px-4">
                  <div className="text-gray-300">
                    {formatDate(session.startedAt)}
                  </div>
                  <div className="text-gray-500 text-sm">
                    {formatTime(session.startedAt)}
                  </div>
                </td>
                <td className="py-3 px-4 text-gray-300">
                  {formatDuration(session.durationSec)}
                </td>
                <td className="py-3 px-4 text-right">
                  <span className={`font-medium ${getProfitColorClass(session.profitChaos)}`}>
                    <CurrencyValue value={session.profitChaos} type="chaos" size={14} />
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full text-white ${getStatusColorClass(
                      session.status
                    )}`}
                  >
                    {getStatusLabel(session.status)}
                  </span>
                </td>
                {showActions && session.status === 'active' && (
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => onEndSession?.(session.id)}
                      className="text-red-400 hover:text-red-300 text-sm transition-colors"
                    >
                      End
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
