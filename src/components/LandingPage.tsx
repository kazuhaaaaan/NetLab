import React from 'react';
import { Sparkles } from 'lucide-react';
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
  /** Buka panel chat Aikari (AI Mentor pre-canvas). */
  onOpenAiChat?: () => void;
  /** true = server Gemini aktif (badge online di tombol). */
  llmOnline?: boolean;
}

/**
 * Public marketing landing page (/home).
 * Purely presentational: it must NOT instantiate the simulator, so it only
 * renders the components under ./landing and never imports engine code.
 */
export const LandingPage: React.FC<LandingPageProps> = ({ onLaunch, onOpenDonate, onOpenAiChat, llmOnline = false }) => {
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

      {/* Tombol melayang Aikari — bisa ditanya sebelum masuk canvas */}
      {onOpenAiChat && (
        <button
          onClick={onOpenAiChat}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-3 rounded-full border border-violet-500/40 bg-[#14161C]/95 backdrop-blur pl-4 pr-5 py-3 shadow-xl transition hover:border-violet-400 hover:bg-[#1A1D24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
          aria-label="Tanya Aikari — AI Mentor NetLab"
          title="Tanya Aikari — AI Mentor NetLab"
        >
          <span className="relative shrink-0">
            <Sparkles className="w-5 h-5 text-violet-300" aria-hidden />
            {llmOnline && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse"
                aria-hidden
              />
            )}
          </span>
          <span className="flex flex-col items-start leading-none">
            <span className="text-[13px] font-bold text-slate-100">Tanya Aikari</span>
            <span className={`text-[10px] font-medium ${llmOnline ? 'text-emerald-400' : 'text-amber-400'}`}>
              {llmOnline ? 'Gemini aktif · online' : 'Mode offline · AI lokal'}
            </span>
          </span>
        </button>
      )}
    </div>
  );
};