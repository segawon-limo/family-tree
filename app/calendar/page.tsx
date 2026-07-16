'use client';

import { useState, useEffect, useCallback } from 'react';

type UlangTahun = { personId: string; nama: string; tanggal: string; usia: number };
type PeringatanWafat = { personId: string; nama: string; panggilan: string | null; tanggal: string; tahunKe: number };
type Pernikahan = { spouseId: string; nama1: string; nama2: string; tanggal: string; tahunKe: number };
type Agenda = { id: string; judul: string; deskripsi: string | null; tanggal: string; createdByUserId: string };

const BULAN_NAMA = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function daysInMonth(year: number, month: number) {
  // month 1-12
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function firstWeekdayOfMonth(year: number, month: number) {
  // 0 = Minggu ... 6 = Sabtu
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);

  const [ulangTahun, setUlangTahun] = useState<UlangTahun[]>([]);
  const [peringatanWafat, setPeringatanWafat] = useState<PeringatanWafat[]>([]);
  const [pernikahan, setPernikahan] = useState<Pernikahan[]>([]);
  const [agenda, setAgenda] = useState<Agenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const [formJudul, setFormJudul] = useState('');
  const [formDeskripsi, setFormDeskripsi] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJudul, setEditJudul] = useState('');
  const [editDeskripsi, setEditDeskripsi] = useState('');

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => setMyUserId(me?.userId ?? null))
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/calendar?year=${year}&month=${month}`)
      .then((r) => {
        if (!r.ok) throw new Error('Gagal memuat kalender.');
        return r.json();
      })
      .then((data) => {
        setUlangTahun(data.ulangTahun ?? []);
        setPeringatanWafat(data.peringatanWafat ?? []);
        setPernikahan(data.pernikahan ?? []);
        setAgenda(data.agenda ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  function goToMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1; y += 1; }
    if (m < 1) { m = 12; y -= 1; }
    setMonth(m);
    setYear(y);
    setSelectedDay(null);
  }

  // Kelompokkan semua item per tanggal (1-31) supaya gampang di-render di grid.
  const itemsByDay: Record<number, { ulangTahun: UlangTahun[]; wafat: PeringatanWafat[]; nikah: Pernikahan[]; agenda: Agenda[] }> = {};
  function ensureDay(d: number) {
    if (!itemsByDay[d]) itemsByDay[d] = { ulangTahun: [], wafat: [], nikah: [], agenda: [] };
    return itemsByDay[d];
  }
  ulangTahun.forEach((u) => ensureDay(parseInt(u.tanggal.slice(8, 10), 10)).ulangTahun.push(u));
  peringatanWafat.forEach((w) => ensureDay(parseInt(w.tanggal.slice(8, 10), 10)).wafat.push(w));
  pernikahan.forEach((p) => ensureDay(parseInt(p.tanggal.slice(8, 10), 10)).nikah.push(p));
  agenda.forEach((a) => ensureDay(parseInt(a.tanggal.slice(8, 10), 10)).agenda.push(a));

  const totalDays = daysInMonth(year, month);
  const firstWeekday = firstWeekdayOfMonth(year, month);
  const cells: Array<number | null> = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  // "Hari ini" dibandingkan pakai komponen UTC, konsisten dengan cara
  // tanggal lain diproses di app ini (lihat lib/treeLayout.ts dkk) --
  // supaya tidak ada mismatch akibat timezone browser vs data di DB.
  const todayUTC = new Date();
  const isCurrentMonth = todayUTC.getUTCFullYear() === year && todayUTC.getUTCMonth() + 1 === month;
  const todayDate = todayUTC.getUTCDate();

  async function submitAgenda() {
    setFormError(null);
    if (!selectedDay) return;
    if (formJudul.trim().length < 2) {
      setFormError('Judul minimal 2 karakter.');
      return;
    }
    setSaving(true);
    try {
      const tanggal = `${year}-${String(month).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ judul: formJudul.trim(), deskripsi: formDeskripsi.trim(), tanggal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Gagal menyimpan agenda.');
      setFormJudul('');
      setFormDeskripsi('');
      load();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(a: Agenda) {
    setEditingId(a.id);
    setEditJudul(a.judul);
    setEditDeskripsi(a.deskripsi ?? '');
  }

  async function submitEdit(id: string) {
    if (editJudul.trim().length < 2) return;
    await fetch(`/api/calendar/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ judul: editJudul.trim(), deskripsi: editDeskripsi.trim() }),
    });
    setEditingId(null);
    load();
  }

  async function deleteAgenda(id: string) {
    if (!confirm('Hapus agenda ini?')) return;
    await fetch(`/api/calendar/${id}`, { method: 'DELETE' });
    load();
  }

  const selected = selectedDay ? itemsByDay[selectedDay] : null;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={() => goToMonth(-1)} style={navBtnStyle}>&larr;</button>
        <h2 style={{ fontFamily: 'var(--font-display)' }}>{BULAN_NAMA[month - 1]} {year}</h2>
        <button onClick={() => goToMonth(1)} style={navBtnStyle}>&rarr;</button>
      </div>

      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
      {loading ? (
        <p style={{ opacity: 0.6 }}>Memuat...</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 20 }}>
            {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((d) => (
              <div key={d} style={{ textAlign: 'center', fontSize: 12, opacity: 0.6, padding: 4 }}>{d}</div>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <div key={`empty-${i}`} />;
              const info = itemsByDay[d];
              const hasEvent = info && (info.ulangTahun.length || info.wafat.length || info.nikah.length || info.agenda.length);
              const isToday = isCurrentMonth && d === todayDate;
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  style={{
                    minHeight: 56,
                    padding: 6,
                    textAlign: 'left',
                    border: isToday ? '2px solid var(--color-terracotta)' : '1px solid var(--color-line)',
                    borderRadius: 'var(--radius)',
                    background: selectedDay === d ? 'var(--color-gold)' : 'var(--color-paper-light)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    position: 'relative',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--color-terracotta)' : undefined }}>
                    {d}{isToday && ' •'}
                  </span>
                  {hasEvent && (
                    <span style={{ display: 'flex', gap: 3 }}>
                      {info.ulangTahun.length > 0 && <span title="Ulang tahun" style={{ fontSize: 11 }}>🎂</span>}
                      {info.wafat.length > 0 && <span title="Peringatan wafat" style={{ fontSize: 11 }}>🕯️</span>}
                      {info.nikah.length > 0 && <span title="Anniversary pernikahan" style={{ fontSize: 11 }}>💍</span>}
                      {info.agenda.length > 0 && <span title="Agenda" style={{ fontSize: 11 }}>📌</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {selectedDay && (
            <div style={{ border: '1px solid var(--color-line)', borderRadius: 'var(--radius)', padding: 16, background: 'var(--color-paper-light)' }}>
              <h3 style={{ marginBottom: 12 }}>
                {selectedDay} {BULAN_NAMA[month - 1]} {year}
              </h3>

              {selected?.ulangTahun.map((u) => (
                <p key={u.personId}>🎂 <strong>{u.nama}</strong> ulang tahun ke-{u.usia}</p>
              ))}
              {selected?.wafat.map((w) => (
                <p key={w.personId}>
                  🕯️ Mengenang {w.tahunKe} tahun berpulangnya{' '}
                  <strong>{w.panggilan ? `${w.panggilan} ${w.nama}` : w.nama}</strong>
                </p>
              ))}
              {selected?.nikah.map((p) => (
                <p key={p.spouseId}>💍 <strong>{p.nama1} & {p.nama2}</strong> — {p.tahunKe} tahun pernikahan</p>
              ))}
              {selected?.agenda.map((a) => (
                <div key={a.id} style={{ borderTop: '1px solid var(--color-line)', paddingTop: 8, marginTop: 8 }}>
                  {editingId === a.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input value={editJudul} onChange={(e) => setEditJudul(e.target.value)} style={inputStyle} />
                      <textarea value={editDeskripsi} onChange={(e) => setEditDeskripsi(e.target.value)} style={inputStyle} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => submitEdit(a.id)} style={primaryBtnStyle}>Simpan</button>
                        <button onClick={() => setEditingId(null)} style={navBtnStyle}>Batal</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p style={{ fontWeight: 600, margin: 0 }}>📌 {a.judul}</p>
                      {a.deskripsi && <p style={{ margin: '2px 0', opacity: 0.8 }}>{a.deskripsi}</p>}
                      {myUserId === a.createdByUserId && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                          <button onClick={() => startEdit(a)} style={linkBtnStyle}>Edit</button>
                          <button onClick={() => deleteAgenda(a.id)} style={{ ...linkBtnStyle, color: 'var(--color-danger)' }}>Hapus</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}

              <div style={{ marginTop: 16, borderTop: '1px solid var(--color-line)', paddingTop: 12 }}>
                <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>Tambah agenda di tanggal ini:</p>
                <input
                  placeholder="Judul agenda"
                  value={formJudul}
                  onChange={(e) => setFormJudul(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 6 }}
                />
                <textarea
                  placeholder="Deskripsi (opsional)"
                  value={formDeskripsi}
                  onChange={(e) => setFormDeskripsi(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 6 }}
                />
                {formError && <p style={{ color: 'var(--color-danger)', fontSize: 13 }}>{formError}</p>}
                <button onClick={submitAgenda} disabled={saving} style={primaryBtnStyle}>
                  {saving ? 'Menyimpan...' : 'Tambah Agenda'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  border: '1px solid var(--color-line)',
  borderRadius: 'var(--radius)',
  background: 'var(--color-paper-light)',
  padding: '6px 12px',
};

const primaryBtnStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 'var(--radius)',
  background: 'var(--color-terracotta)',
  color: '#fff',
  padding: '8px 16px',
  fontWeight: 600,
};

const linkBtnStyle: React.CSSProperties = {
  border: 'none',
  background: 'none',
  color: 'var(--color-terracotta)',
  fontSize: 13,
  padding: 0,
  textDecoration: 'underline',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--color-line)',
  borderRadius: 'var(--radius)',
  padding: '8px 10px',
  fontFamily: 'var(--font-body)',
};