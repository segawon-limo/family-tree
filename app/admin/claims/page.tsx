'use client';

import { useState, useEffect, useCallback } from 'react';

type Klaim = {
  id: string;
  email: string | null;
  noHp: string | null;
  requestedAt: string;
  person: { nama: string; gender: string };
};

type Inquiry = {
  id: string;
  namaDicari: string;
  email: string;
  noHp: string | null;
  catatan: string | null;
  createdAt: string;
};

type ApproveResult = {
  namaUser: string;
  emailUser: string | null;
  noHpUser: string | null;
  setupLink: string;
  linkExpiry: string;
  pesanWA: string;
};

export default function AdminClaimsPage() {
  const [claims, setClaims] = useState<Klaim[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [approveResult, setApproveResult] = useState<ApproveResult | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/claims');
    const data = await res.json();
    setClaims(data.claims ?? []);
    setInquiries(data.inquiries ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAction(
    id: string,
    type: 'klaim' | 'inquiry',
    action: string,
    catatan?: string
  ) {
    setActionLoading(id);
    const res = await fetch(`/api/admin/claims/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, action, catatan }),
    });
    const data = await res.json();
    setActionLoading(null);
    if (action === 'approve' && data.ok) {
      setApproveResult(data);
    }
    await load();
    setRejectId(null);
    setRejectNote('');
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const total = claims.length + inquiries.length;

  return (
    <main style={{ maxWidth: 780, margin: '0 auto', padding: '32px 24px', fontFamily: 'var(--font-body)' }}>
      <header style={{ marginBottom: 28, borderBottom: '2px solid var(--color-gold)', paddingBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: 0 }}>
              Permintaan Masuk
            </h1>
            <p style={{ fontSize: 13, opacity: 0.6, margin: '4px 0 0' }}>
              Klaim akun & laporan nama tidak ditemukan yang perlu ditindaklanjuti.{' '}
              <a href="/admin" style={{ color: 'var(--color-terracotta)' }}>← Admin</a>
            </p>
          </div>
          {total > 0 && (
            <div style={{
              background: 'var(--color-terracotta)', color: 'white',
              borderRadius: 20, padding: '4px 12px', fontSize: 13, fontWeight: 700,
            }}>
              {total} menunggu
            </div>
          )}
        </div>
      </header>

      {loading && <p style={{ opacity: 0.6 }}>Memuat...</p>}

      {/* Hasil approve: tampilkan link + pesan WA */}
      {approveResult && (
        <div style={{
          background: '#eef4ec', border: '2px solid var(--color-moss)',
          borderRadius: 10, padding: 20, marginBottom: 24,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ margin: 0, fontSize: 15, color: 'var(--color-moss)' }}>
              ✅ Klaim disetujui — kirim link ini ke {approveResult.namaUser}
            </h3>
            <button onClick={() => setApproveResult(null)} style={{
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: 0.5,
            }}>×</button>
          </div>
          <p style={{ fontSize: 12, opacity: 0.7, margin: '4px 0 12px' }}>
            Link berlaku sampai {approveResult.linkExpiry}. Setelah user buat password, link otomatis tidak bisa dipakai lagi.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              background: 'white', border: '1px solid var(--color-line)',
              borderRadius: 6, padding: '8px 12px', fontSize: 13,
              fontFamily: 'var(--font-mono)', wordBreak: 'break-all',
            }}>
              {approveResult.setupLink}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => copyToClipboard(approveResult.pesanWA)} style={{
                padding: '8px 14px', background: '#25D366', color: 'white',
                border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                {copied ? '✓ Disalin!' : '📋 Salin Pesan WA'}
              </button>
              {approveResult.noHpUser && (
                <a
                  href={`https://wa.me/${approveResult.noHpUser.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(approveResult.pesanWA)}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    padding: '8px 14px', background: '#128C7E', color: 'white',
                    borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none',
                  }}
                >
                  Buka WA langsung →
                </a>
              )}
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.6 }}>
            Email: {approveResult.emailUser ?? '—'} · HP: {approveResult.noHpUser ?? '—'}
          </div>
        </div>
      )}

      {/* KLAIM PENDING */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          Klaim Akun ({claims.length})
        </h2>

        {!loading && claims.length === 0 && (
          <p style={{ fontSize: 13, opacity: 0.6, fontStyle: 'italic' }}>Tidak ada klaim yang menunggu.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {claims.map(c => (
            <div key={c.id} style={{
              background: 'white', border: '1px solid var(--color-line)',
              borderRadius: 8, padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.person.nama}</div>
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                    {c.email ?? '—'} · {c.noHp ?? 'Tidak ada no HP'} ·{' '}
                    {new Date(c.requestedAt).toLocaleDateString('id-ID', {
                      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {rejectId === c.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
                      <input
                        placeholder="Alasan penolakan (opsional)"
                        value={rejectNote}
                        onChange={e => setRejectNote(e.target.value)}
                        style={{
                          fontSize: 12, padding: '6px 8px',
                          border: '1px solid var(--color-line)', borderRadius: 4,
                        }}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => handleAction(c.id, 'klaim', 'reject', rejectNote)}
                          disabled={actionLoading === c.id}
                          style={{
                            padding: '6px 10px', background: 'var(--color-danger)',
                            color: 'white', border: 'none', borderRadius: 4,
                            fontSize: 12, cursor: 'pointer',
                          }}>
                          Konfirmasi Tolak
                        </button>
                        <button onClick={() => setRejectId(null)} style={{
                          padding: '6px 10px', background: 'transparent',
                          border: '1px solid var(--color-line)', borderRadius: 4,
                          fontSize: 12, cursor: 'pointer',
                        }}>
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => handleAction(c.id, 'klaim', 'approve')}
                        disabled={actionLoading === c.id}
                        style={{
                          padding: '7px 14px', background: 'var(--color-moss)',
                          color: 'white', border: 'none', borderRadius: 6,
                          fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}>
                        {actionLoading === c.id ? '...' : 'Setujui'}
                      </button>
                      <button onClick={() => setRejectId(c.id)} style={{
                        padding: '7px 14px', background: 'transparent',
                        border: '1px solid var(--color-danger)', color: 'var(--color-danger)',
                        borderRadius: 6, fontSize: 13, cursor: 'pointer',
                      }}>
                        Tolak
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* INQUIRY: nama tidak ditemukan */}
      <section>
        <h2 style={{ fontSize: 16, fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          Nama Tidak Ditemukan ({inquiries.length})
        </h2>

        {!loading && inquiries.length === 0 && (
          <p style={{ fontSize: 13, opacity: 0.6, fontStyle: 'italic' }}>Tidak ada laporan yang menunggu.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {inquiries.map(inq => (
            <div key={inq.id} style={{
              background: 'white', border: '1px solid var(--color-line)',
              borderRadius: 8, padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>"{inq.namaDicari}"</div>
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                    {inq.email} · {inq.noHp ?? 'Tidak ada no HP'} ·{' '}
                    {new Date(inq.createdAt).toLocaleDateString('id-ID', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </div>
                  {inq.catatan && (
                    <div style={{
                      marginTop: 6, fontSize: 12, fontStyle: 'italic',
                      padding: '4px 8px', background: 'var(--color-paper-light)',
                      borderRadius: 4, display: 'inline-block',
                    }}>
                      "{inq.catatan}"
                    </div>
                  )}
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    <strong>Tindak lanjut:</strong> tambahkan nama ini di{' '}
                    <a href="/admin" style={{ color: 'var(--color-terracotta)' }}>halaman admin</a>,
                    lalu hubungi{' '}
                    {inq.noHp ? (
                      <a
                        href={`https://wa.me/${inq.noHp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Halo ${inq.namaDicari}, nama kamu sudah kami tambahkan ke daftar silsilah keluarga. Silakan daftar ulang di: ${typeof window !== 'undefined' ? window.location.origin : ''}/register`)}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ color: '#25D366', fontWeight: 600 }}
                      >
                        kirim WA
                      </a>
                    ) : (
                      <span style={{ opacity: 0.6 }}>email: {inq.email}</span>
                    )}
                    {' '}agar mereka bisa daftar ulang.
                  </div>
                </div>
                <button
                  onClick={() => handleAction(inq.id, 'inquiry', 'resolve')}
                  disabled={actionLoading === inq.id}
                  style={{
                    padding: '7px 14px', background: 'var(--color-moss)',
                    color: 'white', border: 'none', borderRadius: 6,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                  }}>
                  {actionLoading === inq.id ? '...' : 'Tandai Selesai'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}