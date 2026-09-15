"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, setSession, type AuthUser } from "@/lib/api";
import { ErrorText, Field, inputClass } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (getToken()) router.replace("/dashboard");
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const body =
        mode === "login"
          ? {
              email: String(form.get("email")),
              password: String(form.get("password")),
            }
          : {
              email: String(form.get("email")),
              password: String(form.get("password")),
              fullName: String(form.get("fullName")),
              phone: String(form.get("phone") || "") || undefined,
            };
      const result = await api<{ token: string; user: AuthUser }>(
        mode === "login" ? "/api/auth/login" : "/api/auth/register",
        { method: "POST", body },
      );
      setSession(result.token, result.user);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="h-1.5 bg-gradient-to-r from-saffron via-white to-indiaGreen" />
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-16 md:grid-cols-2">
        <section className="text-navy">
          <p className="text-xs uppercase tracking-[0.2em] text-saffron">SIH 2026 · PS26036</p>
          <h1 className="mt-3 text-3xl font-semibold">LM Smart</h1>
          <p className="mt-2 text-lg text-slate-700">Legal Metrology Smart Verification Platform</p>
          <p className="mt-6 max-w-md text-sm leading-6 text-slate-600">
            Register weighing and measuring instruments, apply for verification, and complete field
            inspection through role-based portals.
          </p>
          <div className="mt-8 rounded border border-slate-200 bg-white p-4 text-sm">
            <p className="font-semibold">Demo accounts (password Demo@12345)</p>
            <p>Owner: owner@lmsmart.demo</p>
            <p>Admin: admin@lmsmart.demo</p>
            <p>LMO: lmo@lmsmart.demo</p>
          </div>
        </section>
        <form onSubmit={onSubmit} className="space-y-4 rounded border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex gap-2 text-sm">
            <button type="button" className={mode === "login" ? "font-semibold text-navy" : "text-slate-500"} onClick={() => setMode("login")}>
              Sign in
            </button>
            <span className="text-slate-300">|</span>
            <button type="button" className={mode === "register" ? "font-semibold text-navy" : "text-slate-500"} onClick={() => setMode("register")}>
              Register as owner
            </button>
          </div>
          <ErrorText message={error} />
          {mode === "register" ? (
            <>
              <Field label="Full name">
                <input name="fullName" required className={inputClass()} />
              </Field>
              <Field label="Phone">
                <input name="phone" className={inputClass()} />
              </Field>
            </>
          ) : null}
          <Field label="Email">
            <input name="email" type="email" required defaultValue="owner@lmsmart.demo" className={inputClass()} />
          </Field>
          <Field label="Password">
            <input name="password" type="password" required defaultValue="Demo@12345" className={inputClass()} />
          </Field>
          <button disabled={pending} className="w-full rounded bg-navy px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {pending ? "Please wait..." : mode === "login" ? "Sign in" : "Create owner account"}
          </button>
        </form>
      </div>
    </div>
  );
}
