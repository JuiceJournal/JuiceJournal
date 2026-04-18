'use client';

import PublicNavbar from '@/components/PublicNavbar';
import ShowroomHero from '@/components/ShowroomHero';
import ShowroomValueStrip from '@/components/ShowroomValueStrip';
import ShowroomDesktopShowcase from '@/components/ShowroomDesktopShowcase';
import ShowroomWorlds from '@/components/ShowroomWorlds';
import ShowroomFarmShowcase from '@/components/ShowroomFarmShowcase';
import ShowroomClosingCta from '@/components/ShowroomClosingCta';

export default function Home() {
  return (
    <div className="min-h-screen bg-poe-dark text-stone-100">
      <PublicNavbar />
      <main>
        <ShowroomHero />
        <ShowroomValueStrip />
        <ShowroomDesktopShowcase />
        <ShowroomWorlds />
        <ShowroomFarmShowcase />
        <ShowroomClosingCta />
      </main>
    </div>
  );
}
