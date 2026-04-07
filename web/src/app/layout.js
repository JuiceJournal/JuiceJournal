import './globals.css';
import { Cormorant_SC, Source_Sans_3 } from 'next/font/google';
import { AuthProvider } from '@/hooks/useAuth';
import { I18nProvider } from '@/hooks/useI18n';
import { TrackerContextProvider } from '@/hooks/useTrackerContext';
import { Toaster } from 'react-hot-toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const displayFont = Cormorant_SC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
});

const bodyFont = Source_Sans_3({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
});

export const metadata = {
  title: 'Juice Journal',
  description: 'Path of Exile farming journal and tracker',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable} bg-poe-dark text-gray-100 min-h-screen font-sans`}>
        <I18nProvider>
          <AuthProvider>
            <TrackerContextProvider>
              <ErrorBoundary>
                {children}
                <Toaster
                  position="top-right"
                  toastOptions={{
                    style: {
                      background: '#252525',
                      color: '#e0e0e0',
                      border: '1px solid #333',
                    },
                    success: {
                      iconTheme: {
                        primary: '#4caf50',
                        secondary: '#252525',
                      },
                    },
                    error: {
                      iconTheme: {
                        primary: '#f44336',
                        secondary: '#252525',
                      },
                    },
                  }}
                />
              </ErrorBoundary>
            </TrackerContextProvider>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
