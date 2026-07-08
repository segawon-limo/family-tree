'use client';

import { useState, useEffect, useRef } from 'react';

type Me = {
  role: 'admin' | 'member';
  personId: string | null;
  personNama: string | null;
  email: string | null;
  fotoUrl: string | null;
};

export default function AccountPage() {
  const [me, setMe] = useState<Me | null | 'loading'>('loading');

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  if (me === 'loading') return <main style={{ padding: 32 }}>Memuat...</main>;
  if (me === null) return <main style={{ padding: 32 }}>Sesi habis, silakan login ulang.</main>;

  if (!me.personId) {
    return (
      <main style={{ maxWidth: 480, margin: '0 auto', padding: '32px 20px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)' }}>Akun Saya</h1>
        <p style={{ opacity: 0.7 }}>
          Akun ini belum terhubung ke node anggota keluarga manapun, jadi belum ada profil yang
          bisa diedit di sini.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', marginBottom: 24 }}>Akun Saya</h1>

      <FotoSection personId={me.personId} fotoUrl={me.fotoUrl} nama={me.personNama} />
      <NamaSection initialNama={me.personNama ?? ''} />

      <div
        style={{
          marginTop: 32,
          padding: '14px 16px',
          background: 'var(--color-paper-light)',
          border: '1px dashed var(--color-line)',
          borderRadius: 'var(--radius)',
          fontSize: 13,
          opacity: 0.75,
        }}
      >
        Ganti email &amp; password belum tersedia di sini -- perlu diputuskan dulu mekanisme
        konfirmasinya (lihat catatan terpisah). Untuk saat ini hubungi admin kalau perlu ganti
        email/password.
      </div>
    </main>
  );
}

function FotoSection({
  personId,
  fotoUrl,
  nama,
}: {
  personId: string;
  fotoUrl: string | null;
  nama: string | null;
}) {
  const [preview, setPreview] = useState<string | null>(fotoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);

    const form = new FormData();
    form.append('foto', file);

    try {
      const res = await fetch(`/api/admin/persons/${personId}/foto`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Gagal upload (status ${res.status})`);
      // Tambahkan cache-buster supaya browser tidak nampilin foto lama dari cache
      setPreview(`/api/foto/${personId}?t=${Date.now()}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const initial = (nama ?? '?').charAt(0).toUpperCase();

  return (
    <section style={{ marginBottom: 28 }}>
      <label style={{ display: 'block', marginBottom: 8, fontSize: 13, opacity: 0.75 }}>
        Foto Profil
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: preview ? `url(${preview}) center/cover` : 'var(--color-terracotta)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            fontWeight: 600,
            border: '1px solid var(--color-line)',
            flexShrink: 0,
          }}
        >
          {!preview && initial}
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={uploading}
            style={{ fontSize: 13 }}
          />
          <p style={{ fontSize: 12, opacity: 0.6, margin: '6px 0 0' }}>
            JPG, PNG, atau WEBP. Maks 3MB.
          </p>
          {uploading && <p style={{ fontSize: 12, opacity: 0.7 }}>Mengunggah...</p>}
          {error && <p style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</p>}
        </div>
      </div>
    </section>
  );
}

function NamaSection({ initialNama }: { initialNama: string }) {
  const [nama, setNama] = useState(initialNama);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/account/nama', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Gagal simpan (status ${res.status})`);
      setSaved(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ marginBottom: 8 }}>
      <label style={{ display: 'block', marginBottom: 8, fontSize: 13, opacity: 0.75 }}>
        Nama
      </label>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={nama}
          onChange={(e) => {
            setNama(e.target.value);
            setSaved(false);
          }}
          style={{
            flex: 1,
            padding: '8px 10px',
            border: '1px solid var(--color-line)',
            borderRadius: 'var(--radius)',
          }}
        />
        <button
          type="submit"
          disabled={saving || nama.trim().length < 2}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: 'var(--radius)',
            background: 'var(--color-terracotta)',
            color: 'white',
            cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </form>
      {saved && <p style={{ fontSize: 12, color: 'var(--color-moss)', marginTop: 6 }}>Tersimpan.</p>}
      {error && <p style={{ fontSize: 12, color: 'var(--color-danger)', marginTop: 6 }}>{error}</p>}
    </section>
  );
}