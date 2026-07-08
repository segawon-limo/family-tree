'use client';

import { useState, useEffect } from 'react';
import PersonCombobox from '../admin/components/PersonCombobox';

type PersonOption = { id: string; label: string };

export default function KalkulatorPanggilanPage() {
  const [persons, setPersons] = useState<PersonOption[]>([]);
  const [loadingPersons, setLoadingPersons] = useState(true);

  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);

  // Hasil panggilan dari fromId ke SEMUA orang lain, di-cache di sini.
  // Endpoint /api/panggilan/[fromId] sengaja menghitung semua sekaligus
  // (lihat catatan performa di route-nya) -- jadi kita panggil itu SEKALI
  // tiap fromId berganti, lalu tinggal lookup toId dari map ini, bukan
  // hit endpoint lagi tiap toId berganti.
  const [panggilanMap, setPanggilanMap] = useState<Record<string, string>>({});
  const [loadingPanggilan, setLoadingPanggilan] = useState(false);
  const [errorPanggilan, setErrorPanggilan] = useState<string | null>(null);

  const [selfDetected, setSelfDetected] = useState(false);

  useEffect(() => {
    fetch('/api/admin/persons')
      .then((r) => r.json())
      .then((data: { id: string; nama: string }[]) => {
        setPersons(data.map((p) => ({ id: p.id, label: p.nama })));
        setLoadingPersons(false);
      });

    // Default "dari siapa" = diri sendiri, kalau akun ini sudah terhubung
    // ke node person tertentu. Kalau belum (personId null -- misal akun
    // admin tanpa node, atau klaim belum di-approve), biarkan user pilih
    // manual, jangan blokir halaman.
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (me?.personId) {
          setFromId(me.personId);
          setSelfDetected(true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!fromId) {
      setPanggilanMap({});
      return;
    }
    setLoadingPanggilan(true);
    setErrorPanggilan(null);
    fetch(`/api/panggilan/${fromId}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error ?? `Gagal memuat (status ${r.status})`);
        }
        return r.json();
      })
      .then((map: Record<string, string>) => setPanggilanMap(map))
      .catch((err) => setErrorPanggilan(err.message))
      .finally(() => setLoadingPanggilan(false));
  }, [fromId]);

  const fromLabel = persons.find((p) => p.id === fromId)?.label;
  const toLabel = persons.find((p) => p.id === toId)?.label;
  const hasil = toId ? panggilanMap[toId] : null;

  return (
    <main
      style={{
        maxWidth: 560,
        margin: '0 auto',
        padding: '32px 20px',
        fontFamily: 'var(--font-body)',
      }}
    >
      <h1 style={{ fontFamily: 'var(--font-display)', marginBottom: 4 }}>
        Kalkulator Panggilan
      </h1>
      <p style={{ color: 'var(--color-ink)', opacity: 0.7, marginTop: 0, marginBottom: 28 }}>
        Cari tahu kamu manggil siapa apa dalam silsilah keluarga.
      </p>

      {loadingPersons ? (
        <p>Memuat daftar anggota keluarga...</p>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, opacity: 0.75 }}>
              Dari sudut pandang siapa
              {selfDetected && (
                <span style={{ marginLeft: 6, fontStyle: 'italic', opacity: 0.7 }}>
                  (otomatis: kamu)
                </span>
              )}
            </label>
            <PersonCombobox
              options={persons}
              value={fromId}
              onChange={(id) => {
                setFromId(id);
                setSelfDetected(false); // user ganti manual -- bukan lagi "auto diri sendiri"
              }}
              placeholder="Pilih nama..."
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, opacity: 0.75 }}>
              Ke siapa
            </label>
            <PersonCombobox
              options={persons}
              value={toId}
              onChange={setToId}
              placeholder="Pilih nama..."
            />
          </div>

          {!fromId && (
            <p style={{ opacity: 0.6, fontSize: 14 }}>
              Pilih dulu &ldquo;dari sudut pandang siapa&rdquo; di atas.
            </p>
          )}

          {fromId && loadingPanggilan && <p style={{ opacity: 0.6 }}>Menghitung...</p>}

          {fromId && errorPanggilan && (
            <p style={{ color: 'var(--color-danger)' }}>Gagal menghitung: {errorPanggilan}</p>
          )}

          {fromId && !loadingPanggilan && !errorPanggilan && toId && (
            <div
              style={{
                marginTop: 8,
                padding: '16px 18px',
                background: 'var(--color-paper-light)',
                border: '1px solid var(--color-line)',
                borderRadius: 'var(--radius)',
              }}
            >
              {hasil ? (
                hasil.startsWith('(error') ? (
                  <span style={{ color: 'var(--color-danger)' }}>
                    Belum bisa dihitung: {hasil}
                  </span>
                ) : (
                  <span>
                    <strong>{fromLabel}</strong> memanggil <strong>{toLabel}</strong>:{' '}
                    <strong style={{ color: 'var(--color-terracotta-dark)' }}>{hasil}</strong>
                  </span>
                )
              ) : (
                <span style={{ opacity: 0.6 }}>
                  Hubungan antara keduanya belum bisa ditentukan (mungkin tidak terhubung di
                  silsilah).
                </span>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}