import './globals.css';
import { Cormorant_SC, Source_Sans_3 } from 'next/font/google';
import { AuthProvider } from '@/hooks/useAuth';
import { TrackerContextProvider } from '@/hooks/useTrackerContext';
import { Toaster } from 'react-hot-toast';

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
  title: 'PoE Farm Tracker',
  description: 'Path of Exile Farm Tracker',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable} bg-poe-dark text-gray-100 min-h-screen font-sans`}>
        <AuthProvider>
          <TrackerContextProvider>
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
          </TrackerContextProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
