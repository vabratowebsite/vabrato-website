"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createBrowserSupabase, signInWithGoogle, signInWithMagicLink } from "@vabrato/lib";
import { Logo } from "@vabrato/ui/web";
import { btnPrimary, btnSecondary, errorCls, inputCls, labelCls } from "@/components/ui";

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Logo />
        <h1 className="font-display text-display-sm uppercase text-navy">Agent console</h1>
        <p className="font-body text-body-sm text-muted">For the Vabrato team. Clients sign in on vabrato.com.</p>
      </div>

      <section aria-label="Sign in" className="border border-line bg-white p-6">
        {status === "sent" ? (
          <p role="status" className="font-body text-body text-green">
            Check your email: we sent a sign-in link to {email}.
          </p>
        ) : (
          <>
            <form onSubmit={sendLink} className="space-y-4">
              <label className={labelCls}>
                Work email
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@vabrato.com"
                  className={`${inputCls} mt-1`}
                />
              </label>
              <button type="submit" disabled={status === "sending"} className={`${btnPrimary} w-full`}>
                {status === "sending" ? "Sending…" : "Email me a sign-in link"}
              </button>
            </form>

            <div className="my-5 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-line" />
              <span className="font-body text-label uppercase tracking-label text-muted">or</span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <button type="button" onClick={google} className={`${btnSecondary} w-full`}>
              Continue with Google
            </button>
          </>
        )}
        {error && (
          <p role="alert" className={`${errorCls} mt-4`}>
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
