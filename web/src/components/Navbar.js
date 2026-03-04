'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const navItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/sessions', label: 'Session\'lar' },
    { href: '/dashboard/leaderboard', label: 'Leaderboard' },
  ];

  return (
    <nav className="bg-poe-dark border-b border-poe-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/dashboard" className="flex items-center space-x-2">
              <span className="text-2xl">💰</span>
              <span className="text-xl font-bold text-poe-gold">
                PoE Farm Tracker
              </span>
            </Link>
          </div>

          {/* Navigation */}
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

          {/* User */}
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <span className="text-gray-300 text-sm">{user.username}</span>
                <button
                  onClick={logout}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cikis
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="text-sm text-poe-gold hover:text-poe-gold-dark transition-colors"
              >
                Giris Yap
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
