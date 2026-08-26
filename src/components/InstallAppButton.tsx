"use client";

import { useEffect, useState } from "react";

// Chrome/Android's install-prompt event isn't in the standard TS lib types
// yet, so it's typed loosely here rather than fighting the DOM types.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * "Install App" button that adapts to the platform:
 *  - Android/Chrome/Edge: a real one-tap install, using the browser's own
 *    beforeinstallprompt event.
 *  - iPhone/Safari: Apple doesn't allow triggering that prompt at all, so
 *    instead this shows the manual "Share > Add to Home Screen" steps.
 *  - Already installed (running standalone) or platform doesn't support
 *    installing at all: renders nothing.
 */
export function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    const ua = window.navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  if (isStandalone) return null;

  async function handleInstallClick() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }
    if (isIOS) {
      setShowIOSInstructions(true);
    }
  }

  if (!deferredPrompt && !isIOS) return null;

  return (
    <>
      <button
        onClick={handleInstallClick}
        className="px-3 py-2 text-sm rounded text-steel hover:text-ink transition font-medium"
      >
        Install App
      </button>

      {showIOSInstructions && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowIOSInstructions(false)}
        >
          <div
            className="bg-white rounded-lg p-5 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-semibold mb-2">Install Fleet Ops on your iPhone</p>
            <ol className="text-sm text-steel list-decimal list-inside space-y-1.5 mb-4">
              <li>Tap the Share icon in Safari's toolbar</li>
              <li>Scroll down and tap "Add to Home Screen"</li>
              <li>Tap "Add" in the top right</li>
            </ol>
            <button
              onClick={() => setShowIOSInstructions(false)}
              className="w-full bg-brand text-white font-semibold py-2.5 rounded hover:opacity-90 transition"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
