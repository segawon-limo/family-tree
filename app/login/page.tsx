'use client';

import { useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/tree';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Terjadi kesalahan, coba lagi.');
        return;
      }

      // Redirect: admin ke /admin, member ke /tree (atau return URL)
      if (data.role === 'admin') {
        router.push('/admin');
      } else {
        router.push(redirectTo);
      }
      router.refresh(); // paksa Next.js refresh server components
    } catch {
      setError('Tidak bisa terhubung ke server. Periksa koneksi internetmu.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-paper)',
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28,
              color: 'var(--color-ink)',
              marginBottom: 8,
            }}
          >
            Silsilah Keluarga
          </h1>
          <p style={{ fontSize: 14, color: 'var(--color-ink)', opacity: 0.6, margin: 0 }}>
            Masuk untuk melihat dan mengelola silsilah keluarga
          </p>
        </div>

        {/* Form card */}
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-line)',
            borderRadius: 12,
            padding: 32,
            boxShadow: '0 2px 8px rgba(43,38,32,0.10)',
          }}
        >
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
                placeholder="emailmu@contoh.com"
                style={{
                  padding: '10px 12px',
                  border: '1px solid var(--color-line)',
                  borderRadius: 6,
                  fontSize: 14,
                  color: 'var(--color-ink)',
                  background: 'var(--color-paper-light)',
                  width: '100%',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                style={{
                  padding: '10px 12px',
                  border: '1px solid var(--color-line)',
                  borderRadius: 6,
                  fontSize: 14,
                  color: 'var(--color-ink)',
                  background: 'var(--color-paper-light)',
                  width: '100%',
                }}
              />
            </div>

            {error && (
              <div
                style={{
                  padding: '10px 12px',
                  background: '#f5e2dd',
                  border: '1px solid #e8c4bb',
                  borderRadius: 6,
                  fontSize: 13,
                  color: 'var(--color-danger)',
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4,
                padding: '12px 16px',
                background: loading ? '#c79c8c' : 'var(--color-terracotta)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 15,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {loading ? 'Memproses...' : 'Masuk'}
            </button>
          </form>
        </div>

        <p
          style={{
            textAlign: 'center',
            marginTop: 20,
            fontSize: 12,
            opacity: 0.5,
            color: 'var(--color-ink)',
          }}
        >
          Belum punya akun? Hubungi admin keluarga untuk mendaftarkan dirimu.
        </p>
        <p
          style={{
            textAlign: 'center',
            marginTop: 8,
            fontSize: 12,
            opacity: 0.5,
            color: 'var(--color-ink)',
          }}
        >
          Lupa password? Hubungi admin keluarga untuk minta link reset.
        </p>
      </div>
    </main>
  );
}