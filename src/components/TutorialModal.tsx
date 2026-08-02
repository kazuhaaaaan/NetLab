import React, { useState } from 'react';
import {
  HelpCircle,
  MousePointer,
  Touchpad,
  Smartphone,
  Monitor,
  X,
  CheckCircle2,
  Network
} from 'lucide-react';
import { StorageEngine } from '../storage/db';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'desktop' | 'mobile'>('desktop');
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    if (dontShowAgain) {
      StorageEngine.setTutorialSeen(true);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl text-slate-100 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Network className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Welcome to MikroLab</h2>
              <p className="text-xs text-slate-400">Enterprise Browser-Based Networking Simulation</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-950 border border-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('desktop')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center space-x-2 transition ${
              activeTab === 'desktop'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Monitor className="w-4 h-4" />
            <span>Desktop (Mouse & Keys)</span>
          </button>
          <button
            onClick={() => setActiveTab('mobile')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center space-x-2 transition ${
              activeTab === 'mobile'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Mobile / Touch Gestures</span>
          </button>
        </div>

        {/* Desktop Controls */}
        {activeTab === 'desktop' && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-blue-400 flex items-center space-x-1.5">
                <MousePointer className="w-3.5 h-3.5" />
                <span>Left Click</span>
              </div>
              <p className="text-slate-400 text-[11px]">Select device node or port on canvas.</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-emerald-400 flex items-center space-x-1.5">
                <MousePointer className="w-3.5 h-3.5" />
                <span>Double Click</span>
              </div>
              <p className="text-slate-400 text-[11px]">Open vendor CLI terminal panel.</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-amber-400 flex items-center space-x-1.5">
                <MousePointer className="w-3.5 h-3.5" />
                <span>Scroll Wheel</span>
              </div>
              <p className="text-slate-400 text-[11px]">Zoom canvas in/out smooth transform.</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-purple-400 flex items-center space-x-1.5">
                <MousePointer className="w-3.5 h-3.5" />
                <span>Middle Drag / Pan</span>
              </div>
              <p className="text-slate-400 text-[11px]">Pan infinite topology canvas viewport.</p>
            </div>
          </div>
        )}

        {/* Mobile Gestures */}
        {activeTab === 'mobile' && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-blue-400 flex items-center space-x-1.5">
                <Touchpad className="w-3.5 h-3.5" />
                <span>Single Tap</span>
              </div>
              <p className="text-slate-400 text-[11px]">Select node or tap port to connect cable.</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-emerald-400 flex items-center space-x-1.5">
                <Touchpad className="w-3.5 h-3.5" />
                <span>Double Tap</span>
              </div>
              <p className="text-slate-400 text-[11px]">Launch full-screen vendor CLI terminal.</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-cyan-400 flex items-center space-x-1.5">
                <Touchpad className="w-3.5 h-3.5" />
                <span>Pinch Gesture</span>
              </div>
              <p className="text-slate-400 text-[11px]">Two-finger pinch to zoom canvas.</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <div className="font-bold text-amber-400 flex items-center space-x-1.5">
                <Touchpad className="w-3.5 h-3.5" />
                <span>Two Finger Drag</span>
              </div>
              <p className="text-slate-400 text-[11px]">Pan viewport smoothly with two fingers.</p>
            </div>
          </div>
        )}

        {/* Footer & LocalStorage checkbox */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
          <label className="flex items-center space-x-2 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0"
            />
            <span>Don't show again on launch</span>
          </label>

          <button
            onClick={handleClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition flex items-center space-x-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Start Laboratory</span>
          </button>
        </div>
      </div>
    </div>
  );
};
