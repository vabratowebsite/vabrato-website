"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createBrowserSupabase, signInWithGoogle, signInWithMagicLink } from "@vabrato/lib";
import { T } from "@vabrato/ui";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  // Surface failures forwarded by /auth/callback (?error=...).
  useEffect(() => {
    const fromCallback = new URLSearchParams(window.location.search).get("error");
    if (fromCallback) setError(`Sign-in failed: ${fromCallback}`);
  }, []);

  const callbackUrl = () => `${window.location.origin}/auth/callback`;

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const result = await signInWithMagicLink(createBrowserSupabase(), {
      email,
      redirectTo: callbackUrl(),
    });
    if (result.error) {
      setError(result.error);
      setStatus("idle");
    } else {
      setStatus("sent");
    }
  }

  async function google() {
    setError(null);
    const result = await signInWithGoogle(createBrowserSupabase(), { redirectTo: callbackUrl() });
    if (result.error) setError(result.error);
    else if (result.url) window.location.assign(result.url);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <div className="mb-8 text-center">
        <div className="font-serif text-2xl tracking-wide" style={{ color: T.goldDeep }}>
          VABRATO
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-widest" style={{ color: T.faint }}>
          Transaction Desk
        </div>
      </div>

      <section
        className="rounded-2xl p-6"
        style={{ background: T.surface, border: `1px solid ${T.line}` }}
      >
        {status === "sent" ? (
          <p className="text-sm" style={{ color: T.green }}>
            Check your email — we sent a sign-in link to {email}.
          </p>
        ) : (
          <>
            <form onSubmit={sendLink} className="space-y-3">
              <label className="block">
                <span className="text-xs" style={{ color: T.muted }}>
                  Work email
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@vabrato.com"
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: `1px solid ${T.line}`, background: T.surface }}
                />
              </label>
              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-60"
                style={{ background: T.ink, color: T.gold }}
              >
                {status === "sending" ? "Sending…" : "Email me a sign-in link"}
              </button>
            </form>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: T.line }} />
              <span className="text-[11px] uppercase tracking-wider" style={{ color: T.faint }}>
                or
              </span>
              <div className="h-px flex-1" style={{ background: T.line }} />
            </div>

            <button
              onClick={google}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-medium"
              style={{ border: `1px solid ${T.line}`, background: T.surface, color: T.text }}
            >
              Continue with Google
            </button>
          </>
        )}
        {error && (
          <p className="mt-3 text-sm" style={{ color: T.red }}>
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
