"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setError("Email or password didn't match. Try again.");
      return;
    }

    router.push("/calendar");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-ink px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-paper tracking-tight">FLEET OPS</h1>
          <p className="text-steel text-sm mt-1">Sign in to see your jobs</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-paper rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-line rounded px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-safety"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-line rounded px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-safety"
              autoComplete="current-password"
            />
          </div>

          {error && <p className="text-alert text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-safety text-white font-semibold py-3 rounded hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="text-center text-steel text-xs mt-4">
          Don't have an account? Ask your admin to add you as crew.
        </p>
      </div>
    </main>
  );
}
