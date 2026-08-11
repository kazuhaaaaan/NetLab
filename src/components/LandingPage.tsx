import React from 'react';
import { Navbar } from './landing/Navbar';
import { Hero } from './landing/Hero';
import { Features } from './landing/Features';
import { Vendors } from './landing/Vendors';
import { Workflow } from './landing/Workflow';
import { Tutorials } from './landing/Tutorials';
import { LabsPreview } from './landing/LabsPreview';
import { CliPreview } from './landing/CliPreview';
import { OpenSource } from './landing/OpenSource';
import { FinalCta } from './landing/FinalCta';
import { Footer } from './landing/Footer';

interface LandingPageProps {
  onLaunch: (labId?: string) => void;
  onOpenDonate: () => void;
}

/**
 * Public marketing landing page (/home).
 * Purely presentational: it must NOT instantiate the simulator, so it only
 * renders the components under ./landing and never imports engine code.
 */
export const LandingPage: React.FC<LandingPageProps> = ({ onLaunch, onOpenDonate }) => {
  const launch = (labId?: string) => {
    window.scrollTo({ top: 0 });
    onLaunch(labId);
  };

  return (
    <div className="landing-page relative min-h-screen w-full max-w-full overflow-x-clip bg-[#0B0C0E] text-slate-100 font-sans scroll-smooth">
      <Navbar onLaunch={launch} onOpenDonate={onOpenDonate} />
      <main>
        <Hero onLaunch={launch} />
        <Features />
        <Vendors />
        <Workflow />
        <Tutorials onLaunch={launch} />
        <LabsPreview onLaunch={launch} />
        <CliPreview />
        <OpenSource />
        <FinalCta onLaunch={launch} />
      </main>
      <Footer onLaunch={launch} onOpenDonate={onOpenDonate} />
    </div>
  );
};