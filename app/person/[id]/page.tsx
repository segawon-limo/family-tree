'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

type RelatedPerson = { id: string; nama: string; gender: string; fotoUrl: string | null };
type Pasangan = RelatedPerson & { status: string; tanggalNikah: string | null };

type Profile = {
  id: string;
  nama: string;
  gender: string;
  tanggalLahir: string | null;
  tanggalWafat: string | null;
  catatan: string | null;
  fotoUrl: string | null;
  orangTua: RelatedPerson[];
  pasangan: Pasangan[];
  anak: RelatedPerson[];
};

const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function formatTanggal(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function hitungUsia(tanggalLahir: string, tanggalWafat: string | null): number {
  const lahir = new Date(tanggalLahir);
  const acuan = tanggalWafat ? new Date(tanggalWafat) : new Date();
  let usia = acuan.getUTCFullYear() - lahir.getUTCFullYear();
  const belumUlangTahun =
    acuan.getUTCMonth() < lahir.getUTCMonth() ||
    (acuan.getUTCMonth() === lahir.getUTCMonth() && acuan.getUTCDate() < lahir.getUTCDate());
  if (belumUlangTahun) usia -= 1;
  return usia;
}

export default function PersonProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/persons/${id}/profile`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Orang ini tidak ditemukan.' : 'Gagal memuat profil.');
        return r.json();
      })
      .then(setProfile)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ padding: 40 }}>
        <p style={{ opacity: 0.6 }}>Memuat profil...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div style={{ padding: 40 }}>
        <p style={{ color: 'var(--color-danger)' }}>{error ?? 'Profil tidak ditemukan.'}</p>
        <button onClick={() => router.push('/tree')} style={{ marginTop: 12, ...linkBtnStyle }}>
          ← Kembali ke Silsilah
        </button>
      </div>
    );
  }

  const sudahWafat = !!profile.tanggalWafat;
  const usia = profile.tanggalLahir ? hitungUsia(profile.tanggalLahir, profile.tanggalWafat) : null;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px 60px' }}>
      <button onClick={() => router.push('/tree')} style={linkBtnStyle}>
        ← Kembali ke Silsilah
      </button>

      <div
        style={{
          marginTop: 16,
          display: 'flex',
          gap: 20,
          alignItems: 'center',
          padding: 20,
          border: '1px solid var(--color-line)',
          borderRadius: 'var(--radius)',
          background: 'var(--color-paper-light)',
        }}
      >
        <Avatar nama={profile.nama} gender={profile.gender} fotoUrl={profile.fotoUrl} size={88} />
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, margin: 0 }}>{profile.nama}</h1>
          {profile.tanggalLahir && (
            <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.75 }}>
              Lahir {formatTanggal(profile.tanggalLahir)}
              {usia !== null && !sudahWafat && ` • ${usia} tahun`}
            </p>
          )}
          {sudahWafat && (
            <p style={{ margin: '2px 0 0', fontSize: 13, opacity: 0.75 }}>
              Wafat {formatTanggal(profile.tanggalWafat)}
              {usia !== null && ` • usia ${usia} tahun`}
            </p>
          )}
        </div>
      </div>

      {profile.catatan && (
        <div style={{ marginTop: 16, padding: '12px 16px', border: '1px dashed var(--color-line)', borderRadius: 'var(--radius)' }}>
          <p style={{ fontSize: 12, opacity: 0.6, margin: '0 0 4px' }}>Catatan</p>
          <p style={{ margin: 0, fontSize: 14 }}>{profile.catatan}</p>
        </div>
      )}

      <RelasiSection title="Orang Tua" items={profile.orangTua} onNavigate={(pid) => router.push(`/person/${pid}`)} />
      <RelasiSection
        title="Pasangan"
        items={profile.pasangan}
        onNavigate={(pid) => router.push(`/person/${pid}`)}
        renderSubtitle={(p) => {
          const pas = p as Pasangan;
          if (pas.status === 'cerai') return 'Bercerai';
          if (pas.status === 'wafat') return 'Pasangan (wafat)';
          return pas.tanggalNikah ? `Menikah ${formatTanggal(pas.tanggalNikah)}` : 'Menikah';
        }}
      />
      <RelasiSection title="Anak" items={profile.anak} onNavigate={(pid) => router.push(`/person/${pid}`)} />
    </div>
  );
}

function RelasiSection({
  title,
  items,
  onNavigate,
  renderSubtitle,
}: {
  title: string;
  items: RelatedPerson[];
  onNavigate: (id: string) => void;
  renderSubtitle?: (item: RelatedPerson) => string;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 8 }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              border: '1px solid var(--color-line)',
              borderRadius: 8,
              background: 'white',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <Avatar nama={item.nama} gender={item.gender} fotoUrl={item.fotoUrl} size={36} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{item.nama}</div>
              {renderSubtitle && <div style={{ fontSize: 12, opacity: 0.6 }}>{renderSubtitle(item)}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Avatar({
  nama,
  gender,
  fotoUrl,
  size,
}: {
  nama: string;
  gender: string;
  fotoUrl: string | null;
  size: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        background: gender === 'L' ? 'var(--color-male)' : 'var(--color-female)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontWeight: 700,
        fontSize: size * 0.36,
      }}
    >
      {fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        nama.charAt(0).toUpperCase()
      )}
    </div>
  );
}

const linkBtnStyle: React.CSSProperties = {
  border: 'none',
  background: 'none',
  color: 'var(--color-terracotta)',
  fontSize: 13,
  cursor: 'pointer',
  padding: 0,
};