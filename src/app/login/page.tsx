"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Lock, User, Shield, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An error occurred during login");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="w-11 h-11 rounded-xl bg-violet-600 flex items-center justify-center shadow-sm mb-3">
            <CalendarCheck className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">The Logistics WorkHub</h1>
          <p className="ui-muted mt-0.5">Appointment and dispatch desk</p>
        </div>

        {/* Card */}
        <div className="ui-card overflow-hidden shadow-sm">
          <div className="p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Sign in</h2>
              <p className="ui-muted mt-0.5">Use your WorkHub username and password.</p>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-600 leading-relaxed">
                Access is restricted to <span className="font-semibold text-slate-800">System Administrators</span> and{" "}
                <span className="font-semibold text-slate-800">Iqbal (Logistics Manager)</span>.
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-800 text-xs animate-shake">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="ui-label">Username</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="Enter your username (e.g. admin or dispatch)"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="ui-input pl-9 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="ui-label">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="ui-input pl-9 py-2"
                  />
                </div>
              </div>

              <button type="submit" disabled={isLoading} className="ui-btn-primary w-full py-2.5 text-sm">
                {isLoading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying credentials…</span>
                  </>
                ) : (
                  <span>Sign in to logistics desk</span>
                )}
              </button>
            </form>
          </div>

          {/* Footer note */}
          <div className="py-3 px-6 bg-slate-50 border-t border-slate-200 text-center">
            <span className="ui-muted">Connected to Production Consignment Database</span>
          </div>
        </div>
      </div>
    </div>
  );
}
