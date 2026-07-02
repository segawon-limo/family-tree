'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function SetupPasswordPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';

  const [state, setState] = useState<'loading' | 'valid' | 'invalid' | 'done'>('loading');
  const [nama, setNama] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    fetch(`/api/auth/setup-password?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) { setNama(d.nama); setState('valid'); }
        else { setError(d.error); setState('invalid'); }
      })
      .catch(() => setState('invalid'));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('Password minimal 8 karakter.'); return; }
    if (password !== confirm) { setError('Password dan konfirmasi tidak sama.'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setState('done');
      setTimeout(() => router.push('/login'), 2500);
    } catch { setError('Terjadi kesalahan jaringan.'); }
    finally { setSubmitting(false); }
  }

  const inputStyle: React.CSSProperties = {
    padding: '10px 12px', border: '1px solid var(--color-line)',
    borderRadius: 6, fontSize: 14, background: 'var(--color-paper-light)',
    width: '100%', color: 'var(--color-ink)',
  };

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--color-paper)', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, margin: 0 }}>
            Buat Password
          </h1>
        </div>

        <div style={{
          background: 'white', border: '1px solid var(--color-line)',
          borderRadius: 12, padding: 32, boxShadow: '0 2px 8px rgba(43,38,32,0.10)',
        }}>
          {state === 'loading' && (
            <p style={{ opacity: 0.6, textAlign: 'center' }}>Memeriksa link...</p>
          )}

          {state === 'invalid' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
              <p style={{ color: 'var(--color-danger)', fontSize: 14 }}>
                {error ?? 'Link tidak valid atau sudah kedaluwarsa.'}
              </p>
              <p style={{ fontSize: 13, opacity: 0.6 }}>
                Hubungi admin keluarga untuk minta link baru.
              </p>
            </div>
          )}

          {state === 'valid' && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 14, margin: 0, opacity: 0.8 }}>
                Halo, <strong>{nama}</strong>! Buat password untuk akun silsilah keluargamu.
              </p>

              {error && (
                <div style={{
                  padding: '10px 12px', background: '#f5e2dd',
                  borderRadius: 6, fontSize: 13, color: 'var(--color-danger)',
                }}>{error}</div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Password baru (min 8 karakter)</label>
                <input
                  type="password" required autoFocus value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Konfirmasi password</label>
                <input
                  type="password" required value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••" style={inputStyle}
                />
              </div>
              <button type="submit" disabled={submitting} style={{
                padding: '12px 16px',
                background: submitting ? '#c79c8c' : 'var(--color-terracotta)',
                color: 'white', border: 'none', borderRadius: 8,
                fontWeight: 700, fontSize: 15,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}>
                {submitting ? 'Menyimpan...' : 'Simpan Password'}
              </button>
            </form>
          )}

          {state === 'done' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <p style={{ fontSize: 14, fontWeight: 600 }}>Password berhasil dibuat!</p>
              <p style={{ fontSize: 13, opacity: 0.6 }}>
                Mengarahkan ke halaman login...
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}