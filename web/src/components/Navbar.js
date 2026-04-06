'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { useTrackerContext } from '@/hooks/useTrackerContext';
import PoeChromeIcon from '@/components/PoeChromeIcon';
import { getPoeVersionLabel } from '@/lib/utils';

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { locale, locales, setLocale, t } = useI18n();
  const { poeVersion, setPoeVersion, league, setLeague, leagueOptions, loadingLeagues } = useTrackerContext();
  const [leagueDraft, setLeagueDraft] = useState(league);

  useEffect(() => {
    setLeagueDraft(league);
  }, [league]);

  const navItems = [
    { href: '/dashboard', label: t('nav.dashboard'), icon: 'atlas' },
    { href: '/dashboard/sessions', label: t('nav.sessions'), icon: 'sessions' },
    { href: '/dashboard/strategies', label: t('nav.strategies'), icon: 'route' },
    { href: '/dashboard/currency', label: t('nav.currency'), icon: 'market' },
    { href: '/dashboard/leaderboard', label: t('nav.leaderboard'), icon: 'ladder' },
    { href: '/strategies/public', label: t('nav.publicStrategies'), icon: 'gate' },
  ];

  const commitLeague = () => {
    setLeague(leagueDraft.trim() || 'Standard');
  };

  return (
    <nav className="border-b border-poe-border/70 bg-[rgba(8,7,6,0.86)] backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="group flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-poe-border bg-[radial-gradient(circle_at_30%_30%,rgba(214,180,110,0.22),rgba(22,18,15,0.94))] shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-transform duration-200 group-hover:scale-[1.03]">
                  <PoeChromeIcon type="sigil" size={28} className="text-poe-gold drop-shadow-[0_0_12px_rgba(198,161,91,0.22)]" />
                </div>
                <div>
                  <p className="section-kicker">{t('brand.kicker')}</p>
                  <p className="font-display text-2xl uppercase tracking-[0.18em] text-poe-gold">
                    {t('app.name')}
                  </p>
                </div>
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {navItems.map((item) => {
                const isRootDashboard = item.href === '/dashboard';
                const isActive = pathname === item.href || (!isRootDashboard && pathname.startsWith(`${item.href}/`));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-full border px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] transition-all ${
                      isActive
                        ? 'border-poe-gold/50 bg-poe-gold/15 text-poe-gold shadow-[0_0_0_1px_rgba(198,161,91,0.1)_inset]'
                        : 'border-poe-border bg-[rgba(28,23,20,0.6)] text-stone-300 hover:border-poe-gold/30 hover:text-stone-100'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <PoeChromeIcon type={item.icon} size={15} />
                      <span>{item.label}</span>
                    </span>
                  </Link>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-4">
              {user ? (
                <>
                  <div className="text-right">
                    <p className="section-kicker inline-flex items-center gap-2">
                      <PoeChromeIcon type="gate" size={13} className="text-poe-gold/80" />
                      <span>{t('user.account')}</span>
                    </p>
                    <p className="text-sm font-semibold text-stone-200">{user.username}</p>
                  </div>
                  <button
                    onClick={logout}
                    className="rounded-full border border-poe-border bg-[rgba(32,26,22,0.82)] px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-stone-300 transition-colors hover:border-poe-gold/35 hover:text-stone-100"
                  >
                    {t('user.logout')}
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="rounded-full border border-poe-border bg-[rgba(32,26,22,0.82)] px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-poe-gold transition-colors hover:border-poe-gold/35 hover:text-amber-200"
                >
                  {t('user.signIn')}
                </Link>
              )}
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-poe-border bg-[linear-gradient(180deg,rgba(30,25,21,0.92),rgba(17,14,12,0.96))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.28)] lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="section-kicker inline-flex items-center gap-2">
                <PoeChromeIcon type="vault" size={13} className="text-poe-gold/80" />
                <span>{t('context.title')}</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="context-chip border-sky-500/30 bg-sky-500/10 text-sky-200">
                  {getPoeVersionLabel(poeVersion)}
                </span>
                <span className="context-chip border-poe-border bg-[rgba(198,161,91,0.08)] text-stone-200">
                  {league}
                </span>
                <span className="text-sm text-poe-mist">
                  {t('context.helper')}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                className="input min-w-[10rem] text-sm"
                aria-label={t('context.selectLanguage')}
              >
                {locales.map((entry) => (
                  <option key={entry.code} value={entry.code}>{entry.label}</option>
                ))}
              </select>

              <select
                value={poeVersion}
                onChange={(e) => setPoeVersion(e.target.value)}
                className="input min-w-[9rem] text-sm"
                aria-label={t('context.selectVersion')}
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
                  placeholder={loadingLeagues ? t('context.loadingLeagues') : t('context.leaguePlaceholder')}
                  className="input min-w-[12rem] text-sm"
                  aria-label={t('context.leaguePlaceholder')}
                />
                <datalist id="tracker-league-options">
                  {leagueOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
