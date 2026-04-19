'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import PoeChromeIcon from '@/components/PoeChromeIcon';
import BrandLogo from '@/components/BrandLogo';
import toast from 'react-hot-toast';
import { getApiErrorMessage } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { user, login, register } = useAuth();
  const { t } = useI18n();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  });

  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = isLogin
        ? await login({ username: formData.username, password: formData.password })
        : await register(formData);

      if (response.success) {
        toast.success(isLogin ? t('toast.welcomeBack') : t('toast.accountCreated'));
        router.push('/dashboard');
      } else {
        toast.error(getApiErrorMessage(response, isLogin ? t('toast.signInError') : t('toast.createError')));
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, isLogin ? t('toast.signInError') : t('toast.createError')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-poe-dark px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(152,78,42,0.18),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(198,161,91,0.12),transparent_20%)]" />
      <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="hidden lg:block">
          <p className="section-kicker">{t('brand.kicker')}</p>
          <h1 className="mt-4 max-w-3xl font-display text-6xl uppercase leading-[0.92] text-stone-100">
            {t('auth.heroTitle')}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-poe-mist">
            {t('auth.heroBody')}
          </p>

          <div className="mt-8 grid max-w-2xl gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-poe-border bg-[rgba(20,16,14,0.78)] p-4">
              <p className="section-kicker inline-flex items-center gap-2">
                <PoeChromeIcon type="atlas" size={14} className="text-poe-gold/80" />
                <span>{t('auth.maps')}</span>
              </p>
              <p className="mt-3 font-display text-2xl uppercase text-poe-gold">{t('auth.mapsValue')}</p>
              <p className="mt-2 text-sm text-poe-mist">{t('auth.mapsBody')}</p>
            </div>
            <div className="rounded-2xl border border-poe-border bg-[rgba(20,16,14,0.78)] p-4">
              <p className="section-kicker inline-flex items-center gap-2">
                <PoeChromeIcon type="market" size={14} className="text-poe-gold/80" />
                <span>{t('auth.market')}</span>
              </p>
              <p className="mt-3 font-display text-2xl uppercase text-poe-gold">{t('auth.marketValue')}</p>
              <p className="mt-2 text-sm text-poe-mist">{t('auth.marketBody')}</p>
            </div>
            <div className="rounded-2xl border border-poe-border bg-[rgba(20,16,14,0.78)] p-4">
              <p className="section-kicker inline-flex items-center gap-2">
                <PoeChromeIcon type="sigil" size={14} className="text-poe-gold/80" />
                <span>{t('auth.focus')}</span>
              </p>
              <p className="mt-3 font-display text-2xl uppercase text-poe-gold">{t('auth.focusValue')}</p>
              <p className="mt-2 text-sm text-poe-mist">{t('auth.focusBody')}</p>
            </div>
          </div>
        </section>

        <section className="card mx-auto w-full max-w-lg">
          <div className="flex items-center gap-4">
            <BrandLogo
              alt="Juice Journal logo"
              width={56}
              height={56}
              priority
              className="h-14 w-14 shrink-0 drop-shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
            />
            <div>
              <p className="section-kicker">{isLogin ? t('auth.signInKicker') : t('auth.createKicker')}</p>
              <h2 className="mt-1 font-display text-3xl uppercase tracking-[0.12em] text-stone-100">
                {isLogin ? t('auth.signInTitle') : t('auth.createTitle')}
              </h2>
            </div>
          </div>

          <p className="mt-5 text-sm leading-6 text-poe-mist">
            {isLogin
              ? t('auth.signInBody')
              : t('auth.createBody')}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-poe-mist">
                {isLogin ? t('auth.usernameOrEmail') : t('auth.username')}
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="input"
                required
                minLength={3}
              />
            </div>

            {!isLogin && (
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-poe-mist">
                  {t('auth.email')}
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input"
                  required
                />
              </div>
            )}

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-poe-mist">
                {t('auth.password')}
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="input"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary mt-4 w-full disabled:opacity-50"
            >
              {loading ? t('auth.processing') : isLogin ? t('auth.enterDashboard') : t('auth.createAccount')}
            </button>
          </form>

          <div className="mt-6 border-t border-poe-border/70 pt-5 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm font-semibold uppercase tracking-[0.14em] text-poe-gold transition-colors hover:text-amber-200"
            >
              {isLogin ? t('auth.needAccount') : t('auth.haveAccount')}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
