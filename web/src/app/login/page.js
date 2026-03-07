'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const { user, login, register } = useAuth();
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
        toast.success(isLogin ? 'Welcome!' : 'Account created!');
        router.push('/dashboard');
      } else {
        toast.error(response.error || 'An error occurred');
      }
    } catch (error) {
      toast.error(error.error || 'An error occurred during the operation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-poe-dark px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-5xl">💰</span>
          <h1 className="mt-4 text-2xl font-bold text-poe-gold">
            PoE Farm Tracker
          </h1>
          <p className="mt-2 text-gray-400">
            Path of Exile farm tracking application
          </p>
        </div>

        {/* Form */}
        <div className="bg-poe-card rounded-lg p-8">
          <h2 className="text-xl font-semibold text-white mb-6">
            {isLogin ? 'Sign In' : 'Create Account'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-gray-400 text-sm mb-1">
                {isLogin ? 'Username or Email' : 'Username'}
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
                <label className="block text-gray-400 text-sm mb-1">
                  Email
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
              <label className="block text-gray-400 text-sm mb-1">
                Password
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
              className="w-full btn btn-primary py-3 disabled:opacity-50"
            >
              {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-poe-gold hover:text-poe-gold-dark text-sm"
            >
              {isLogin
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-gray-500 text-sm">
          PoE Farm Tracker &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
