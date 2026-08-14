"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const searchParams = useSearchParams();

  // When someone clicks an invite (or "forgot password") email link, they
  // either arrive with #type=invite / #type=recovery in the URL hash (the
  // older implicit flow), or - since this app's Supabase client uses the
  // PKCE flow - via our /auth/callback route, which exchanges the one-time
  // code for a real session and forwards them here with ?type=invite or
  // ?type=recovery in the query string instead. Either form means: show
  // the "set your password" form, not the normal login form.
  const [mode, setMode] = useState<"login" | "set-password" | "checking">("checking");

  useEffect(() => {
    const hash = window.location.hash;
    const queryType = searchParams.get("type");
    if (
      hash.includes("type=invite") ||
      hash.includes("type=recovery") ||
      queryType === "invite" ||
      queryType === "recovery"
    ) {
      setMode("set-password");
    } else {
      setMode("login");
    }
  }, [searchParams]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-ink px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-paper tracking-tight">FLEET OPS</h1>
          <p className="text-steel text-sm mt-1">
            {mode === "set-password" ? "Set your password to finish setting up your account" : "Sign in to see your jobs"}
          </p>
        </div>

        {mode === "set-password" && <SetPasswordForm onDone={() => { router.push("/calendar"); router.refresh(); }} />}
        {mode === "login" && <LoginForm onDone={() => { router.push("/calendar"); router.refresh(); }} />}
      </div>
    </main>
  );
}

function LoginForm({ onDone }: { onDone: () => void }) {
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

    onDone();
  }

  return (
    <>
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
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="text-center text-steel text-xs mt-4">
        Don't have an account? Ask your admin to add you as crew.
      </p>
    </>
  );
}

function SetPasswordForm({ onDone }: { onDone: () => void }) {
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message || "Couldn't set your password. Try again.");
      return;
    }

    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-paper rounded-lg p-6 space-y-4">
      <div>
        <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">
          New Password
        </label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-line rounded px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-safety"
          autoComplete="new-password"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">
          Confirm Password
        </label>
        <input
          type="password"
          required
          minLength={6}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full border border-line rounded px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-safety"
          autoComplete="new-password"
        />
      </div>

      {error && <p className="text-alert text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-safety text-white font-semibold py-3 rounded hover:opacity-90 disabled:opacity-50 transition"
      >
        {loading ? "Setting password..." : "Set Password & Sign In"}
      </button>
    </form>
  );
}
