"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Not fatal - the app works fine without it, this just means it
        // won't be considered "installable" on browsers that require one.
      });
    }
  }, []);

  return null;
}
