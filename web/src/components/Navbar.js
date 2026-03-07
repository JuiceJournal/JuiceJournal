'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useTrackerContext } from '@/hooks/useTrackerContext';
import CurrencyIcon from '@/components/CurrencyIcon';

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { poeVersion, setPoeVersion, league, setLeague, leagueOptions, loadingLeagues } = useTrackerContext();
  const [leagueDraft, setLeagueDraft] = useState(league);

  useEffect(() => {
    setLeagueDraft(league);
  }, [league]);

  const navItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/sessions', label: 'Sessions' },
    { href: '/dashboard/currency', label: 'Currency' },
    { href: '/dashboard/leaderboard', label: 'Leaderboard' },
  ];

  const commitLeague = () => {
    setLeague(leagueDraft.trim() || 'Standard');
  };

  return (
    <nav className="bg-poe-dark border-b border-poe-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 flex-col gap-3 py-3 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:py-0">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/dashboard" className="flex items-center space-x-2">
              <CurrencyIcon type="exalted" size={28} />
              <span className="text-xl font-bold text-poe-gold">
                PoE Farm Tracker
              </span>
            </Link>
          </div>

          {/* Navigation */}
          <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="hidden md:block">
              <div className="flex items-center space-x-4">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      pathname === item.href
                        ? 'text-poe-gold bg-poe-card'
                        : 'text-gray-300 hover:text-white hover:bg-poe-card'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <select
                value={poeVersion}
                onChange={(e) => setPoeVersion(e.target.value)}
                className="bg-poe-card border border-poe-border rounded-md px-3 py-2 text-sm text-white focus:border-poe-gold focus:outline-none"
                aria-label="Select game version"
              >
                <option value="poe1">PoE 1</option>
                <option value="poe2">PoE 2</option>
              </select>

              <div className="flex flex-col">
                <input
                  list="tracker-league-options"
                  value={leagueDraft}
                  onChange={(e) => setLeagueDraft(e.target.value)}
                  onBlur={commitLeague}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitLeague();
                    }
                  }}
                  placeholder={loadingLeagues ? 'Loading leagues...' : 'League'}
                  className="bg-poe-card border border-poe-border rounded-md px-3 py-2 text-sm text-white focus:border-poe-gold focus:outline-none"
                  aria-label="League"
                />
                <datalist id="tracker-league-options">
                  {leagueOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          {/* User */}
          <div className="flex items-center justify-end space-x-4">
            {user ? (
              <>
                <span className="text-gray-300 text-sm">{user.username}</span>
                <button
                  onClick={logout}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="text-sm text-poe-gold hover:text-poe-gold-dark transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
