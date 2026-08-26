"use client";

import { useEffect, useState } from "react";
import { getDeferredInstallPrompt, clearDeferredInstallPrompt, onInstallPromptAvailable } from "@/lib/pwaInstall";

export function InstallAppButton() {
  const [hasPrompt, setHasPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    const ua = window.navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);

    if (getDeferredInstallPrompt()) setHasPrompt(true);

    const unsubscribe = onInstallPromptAvailable(() => setHasPrompt(true));
    return unsubscribe;
  }, []);

  if (isStandalone) return null;

  async function handleInstallClick() {
    const prompt = getDeferredInstallPrompt();
    if (prompt) {
      await prompt.prompt();
      await prompt.userChoice;
      clearDeferredInstallPrompt();
      setHasPrompt(false);
      return;
    }
    if (isIOS) {
      setShowIOSInstructions(true);
    }
  }

  if (!hasPrompt && !isIOS) return null;

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
          <div className="bg-white rounded-lg p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
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
