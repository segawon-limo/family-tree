'use client';

import { useState, useEffect, useCallback } from 'react';

type Step = 'code' | 'email' | 'search' | 'done' | 'not-found-form' | 'not-found-done';
type SearchResult = { id: string; nama: string; gender: string; disambiguator: string | null };

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: '1px solid var(--color-line)',
  borderRadius: 6,
  fontSize: 14,
  background: 'var(--color-paper-light)',
  width: '100%',
  color: 'var(--color-ink)',
};

const btnPrimary: React.CSSProperties = {
  padding: '11px 16px',
  background: 'var(--color-terracotta)',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
  width: '100%',
};

export default function RegisterPage() {
  const [step, setStep] = useState<Step>('code');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Step 1
  const [kode, setKode] = useState('');
  // Step 2
  const [email, setEmail] = useState('');
  const [noHp, setNoHp] = useState('');
  // Step 3
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  // Not-found form
  const [namaTidakAda, setNamaTidakAda] = useState('');
  const [catatanNotFound, setCatatanNotFound] = useState('');

  async function post(body: object) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Terjadi kesalahan.');
    return data;
  }

  async function handleValidateCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      await post({ action: 'validate-code', kode });
      setStep('email');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) { setError('Email tidak valid.'); return; }
    setError(null);
    setStep('search');
  }

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const data = await post({ action: 'search', query: q, kode });
      setResults(data.results ?? []);
    } catch { setResults([]); }
    finally { setSearching(false); }
  }, [kode]); // PENTING: kode wajib di deps -- tanpa ini closure "beku" di
              // nilai kode saat render PERTAMA (selalu '', sebelum user
              // sempat isi apa-apa), gara-gara useCallback([]) nggak pernah
              // dibuat ulang meski kode berubah. Bug ini bikin search di
              // step 3 selalu ngirim kode kosong walau step 1 sukses.

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 350);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  async function handleClaim() {
    if (!selected) return;
    setError(null); setLoading(true);
    try {
      await post({ action: 'claim', personId: selected.id, email, noHp, kode });
      setStep('done');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleNotFound(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      await post({
        action: 'not-found',
        namaDicari: namaTidakAda || query,
        email,
        noHp,
        catatan: catatanNotFound,
        kode,
      });
      setStep('not-found-done');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  const card: React.CSSProperties = {
    background: 'white',
    border: '1px solid var(--color-line)',
    borderRadius: 12,
    padding: 32,
    boxShadow: '0 2px 8px rgba(43,38,32,0.10)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  };

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--color-paper)', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, margin: 0 }}>
            Daftar ke Silsilah Keluarga
          </h1>
          <p style={{ fontSize: 13, opacity: 0.6, margin: '6px 0 0' }}>
            Sudah punya akun? <a href="/login" style={{ color: 'var(--color-terracotta)' }}>Masuk di sini</a>
          </p>
        </div>

        {/* Step indicator */}
        {step !== 'done' && step !== 'not-found-done' && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, justifyContent: 'center' }}>
            {(['code', 'email', 'search'] as Step[]).map((s, i) => {
              const stepIdx = ['code', 'email', 'search', 'not-found-form'].indexOf(step);
              const done = stepIdx > i;
              const active = stepIdx === i;
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 12,
                    fontWeight: 700,
                    background: done ? 'var(--color-moss)' : active ? 'var(--color-terracotta)' : 'var(--color-line)',
                    color: done || active ? 'white' : 'var(--color-ink)',
                  }}>
                    {done ? '✓' : i + 1}
                  </div>
                  {i < 2 && <div style={{ width: 24, height: 1, background: done ? 'var(--color-moss)' : 'var(--color-line)' }} />}
                </div>
              );
            })}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: '10px 12px', marginBottom: 12,
            background: '#f5e2dd', border: '1px solid #e8c4bb',
            borderRadius: 6, fontSize: 13, color: 'var(--color-danger)',
          }}>{error}</div>
        )}

        {/* STEP 1: Kode keluarga */}
        {step === 'code' && (
          <form onSubmit={handleValidateCode} style={card}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, margin: 0 }}>
              Masukkan kode keluarga
            </h2>
            <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>
              Kode ini dibagikan oleh admin keluarga (biasanya saat reuni atau via grup WA).
            </p>
            <input
              autoFocus required value={kode}
              onChange={e => setKode(e.target.value)}
              placeholder="Kode keluarga..."
              style={inputStyle}
            />
            <button type="submit" disabled={loading} style={btnPrimary}>
              {loading ? 'Memeriksa...' : 'Lanjut →'}
            </button>
          </form>
        )}

        {/* STEP 2: Email + no HP */}
        {step === 'email' && (
          <form onSubmit={handleEmail} style={card}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, margin: 0 }}>
              Isi kontakmu
            </h2>
            <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>
              Dipakai admin untuk mengirimkan link aktivasi akun setelah disetujui.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Email *</label>
              <input
                type="email" required autoFocus value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="emailmu@contoh.com" style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>No HP / WhatsApp (opsional)</label>
              <input
                value={noHp} onChange={e => setNoHp(e.target.value)}
                placeholder="08xxxxxxxxxx" style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setStep('code')} style={{
                ...btnPrimary, background: 'transparent',
                color: 'var(--color-ink)', border: '1px solid var(--color-line)',
              }}>← Kembali</button>
              <button type="submit" style={btnPrimary}>Lanjut →</button>
            </div>
          </form>
        )}

        {/* STEP 3: Cari nama */}
        {step === 'search' && (
          <div style={card}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, margin: 0 }}>
              Cari namamu di daftar
            </h2>
            <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>
              Ketik sebagian namamu. Nama ditampilkan dengan "bin/binti [nama bapak]" untuk membedakan
              anggota yang namanya mirip.
            </p>
            <input
              autoFocus value={query}
              onChange={e => { setQuery(e.target.value); setSelected(null); setError(null); }}
              placeholder="Ketik namamu..."
              style={inputStyle}
            />

            {searching && <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>Mencari...</p>}

            {!searching && query.trim().length >= 2 && results.length === 0 && (
              <div style={{
                padding: 14, background: 'var(--color-paper-light)',
                borderRadius: 8, border: '1px solid var(--color-line)', fontSize: 13,
              }}>
                Nama tidak ditemukan di daftar.{' '}
                <button onClick={() => {
                  setNamaTidakAda(query);
                  setStep('not-found-form');
                }} style={{
                  background: 'none', border: 'none', color: 'var(--color-terracotta)',
                  cursor: 'pointer', fontWeight: 600, padding: 0, fontSize: 13,
                }}>
                  Lapor ke admin →
                </button>
              </div>
            )}

            {results.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                {results.map(r => (
                  <button key={r.id} onClick={() => setSelected(r)} style={{
                    textAlign: 'left', padding: '10px 14px',
                    border: `2px solid ${selected?.id === r.id ? 'var(--color-terracotta)' : 'var(--color-line)'}`,
                    borderRadius: 8, background: selected?.id === r.id ? '#fdf0ec' : 'white',
                    cursor: 'pointer',
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{r.nama}</div>
                    {r.disambiguator && (
                      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                        {r.disambiguator}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <div style={{
                padding: '10px 14px', background: '#eef4ec',
                border: '1px solid var(--color-moss)', borderRadius: 8, fontSize: 13,
              }}>
                Kamu memilih: <strong>{selected.nama}</strong>
                {selected.disambiguator && <span style={{ opacity: 0.7 }}> ({selected.disambiguator})</span>}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep('email')} style={{
                ...btnPrimary, background: 'transparent',
                color: 'var(--color-ink)', border: '1px solid var(--color-line)',
              }}>← Kembali</button>
              <button
                onClick={handleClaim}
                disabled={!selected || loading}
                style={{
                  ...btnPrimary,
                  background: !selected || loading ? '#c79c8c' : 'var(--color-terracotta)',
                  cursor: !selected || loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Mengirim...' : 'Ajukan Klaim →'}
              </button>
            </div>
          </div>
        )}

        {/* Not-found form */}
        {step === 'not-found-form' && (
          <form onSubmit={handleNotFound} style={card}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, margin: 0 }}>
              Laporkan nama yang tidak ditemukan
            </h2>
            <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>
              Admin akan menghubungimu di <strong>{email}</strong> untuk menambahkan namamu ke daftar.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Nama lengkapmu *</label>
              <input
                required value={namaTidakAda}
                onChange={e => setNamaTidakAda(e.target.value)}
                placeholder="Nama lengkap sesuai data keluarga" style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Catatan tambahan (opsional)</label>
              <textarea
                value={catatanNotFound}
                onChange={e => setCatatanNotFound(e.target.value)}
                placeholder="Misal: anak dari Pak X, cucu dari Bu Y..."
                rows={3} style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setStep('search')} style={{
                ...btnPrimary, background: 'transparent',
                color: 'var(--color-ink)', border: '1px solid var(--color-line)',
              }}>← Kembali</button>
              <button type="submit" disabled={loading} style={btnPrimary}>
                {loading ? 'Mengirim...' : 'Kirim Laporan'}
              </button>
            </div>
          </form>
        )}

        {/* Done */}
        {step === 'done' && (
          <div style={{ ...card, textAlign: 'center', gap: 12 }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: 0 }}>
              Permintaan terkirim!
            </h2>
            <p style={{ fontSize: 14, opacity: 0.7, margin: 0 }}>
              Admin keluarga akan mengecek permintaanmu dan mengirimkan link aktivasi ke{' '}
              <strong>{email}</strong> setelah disetujui.
            </p>
            <p style={{ fontSize: 13, opacity: 0.55, margin: 0 }}>
              Proses ini biasanya selesai dalam 1–2 hari. Kalau sudah lama tidak ada kabar,
              hubungi admin langsung.
            </p>
          </div>
        )}

        {step === 'not-found-done' && (
          <div style={{ ...card, textAlign: 'center', gap: 12 }}>
            <div style={{ fontSize: 40 }}>📨</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: 0 }}>
              Laporan terkirim ke admin
            </h2>
            <p style={{ fontSize: 14, opacity: 0.7, margin: 0 }}>
              Admin akan menambahkan namamu ke daftar dan menghubungimu di{' '}
              <strong>{email}</strong>.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}