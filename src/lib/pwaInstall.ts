type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<(e: InstallPromptEvent) => void>();

export function captureInstallPrompt(e: InstallPromptEvent) {
  deferredPrompt = e;
  listeners.forEach((cb) => cb(e));
}

export function getDeferredInstallPrompt() {
  return deferredPrompt;
}

export function clearDeferredInstallPrompt() {
  deferredPrompt = null;
}

export function onInstallPromptAvailable(cb: (e: InstallPromptEvent) => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
