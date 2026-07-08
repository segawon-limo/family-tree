'use client';

import { useState, useEffect, useCallback } from 'react';
import PersonCombobox from './components/PersonCombobox';
import TreePreview from './components/TreePreview';

type PersonRow = {
  id: string;
  nama: string;
  gender: string;
  urutanKelahiran: number;
  tanggalLahir: string | null;
  catatan: string | null;
  bapakId: string | null;
  bapakNama: string | null;
  ibuId: string | null;
  ibuNama: string | null;
  hasAccount: boolean;
  userId: string | null;
};

type SpouseRow = {
  id: string;
  person1Id: string;
  person2Id: string;
  status: string;
  tanggalNikah: string | null;
  person1: { nama: string };
  person2: { nama: string };
};

const statusLabel: Record<string, string> = {
  menikah: 'Menikah (aktif)',
  cerai: 'Cerai',
  wafat: 'Salah satu wafat',
};

const emptyForm = {
  nama: '',
  gender: 'L' as 'L' | 'P',
  urutanKelahiran: '',
  tanggalLahir: '',
  bapakId: null as string | null,
  ibuId: null as string | null,
  tipe: 'kandung' as 'kandung' | 'angkat',
  catatan: '',
};

const emptySpouseForm = {
  person1Id: null as string | null,
  person2Id: null as string | null,
  status: 'menikah',
  tanggalNikah: '',
};

export default function AdminPage() {
  const [persons, setPersons] = useState<PersonRow[]>([]);
  const [spouses, setSpouses] = useState<SpouseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [spouseForm, setSpouseForm] = useState(emptySpouseForm);
  const [spouseSubmitting, setSpouseSubmitting] = useState(false);
  const [spouseMessage, setSpouseMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [pRes, sRes] = await Promise.all([
      fetch('/api/admin/persons?forAdminManagement=1'),
      fetch('/api/admin/spouse?forAdminManagement=1'),
    ]);
    setPersons(await pRes.json());
    setSpouses(await sRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const bapakOptions = persons
    .filter((p) => p.gender === 'L' && p.id !== editingId)
    .map((p) => ({ id: p.id, label: p.nama }));
  const ibuOptions = persons
    .filter((p) => p.gender === 'P' && p.id !== editingId)
    .map((p) => ({ id: p.id, label: p.nama }));

  async function handleSelectNode(id: string) {
    setMessage(null);
    setEditingId(id);
    try {
      const res = await fetch(`/api/admin/persons/${id}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: errBody?.error ?? `Gagal memuat data untuk diedit (status ${res.status}).` });
        setEditingId(null);
        return;
      }
      const data = await res.json();
      setForm({
        nama: data.nama,
        gender: data.gender,
        urutanKelahiran: String(data.urutanKelahiran),
        tanggalLahir: data.tanggalLahir ? String(data.tanggalLahir).slice(0, 10) : '',
        bapakId: data.bapakId,
        ibuId: data.ibuId,
        tipe: data.tipe || 'kandung',
        catatan: data.catatan || '',
      });
      // kemudahan: pra-isi Pasangan 1 dgn org yg sedang diedit, supaya
      // alur "edit org -> langsung tambah pasangannya" tidak perlu cari ulang
      setSpouseForm((f) => ({ ...f, person1Id: id }));
    } catch (err: any) {
      // SEBELUMNYA: tidak ada try/catch di sini sama sekali. Kalau fetch
      // gagal (network error) atau res.json() gagal parse, promise reject
      // diam-diam (unhandled rejection) -- editingId sudah kadung ke-set
      // (makanya judul panel jadi "Edit Anggota"), tapi setForm() TIDAK
      // PERNAH kepanggil, jadi form tetap di nilai kosong awal. Itu bikin
      // gejala "form kosong pas klik edit" tanpa pesan error apapun.
      console.error('[handleSelectNode] gagal memuat data person:', err);
      setMessage({ type: 'error', text: `Terjadi kesalahan saat memuat data: ${err?.message ?? 'unknown error'}` });
      setEditingId(null);
    }
  }

  async function handleSpouseSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSpouseMessage(null);
    if (!spouseForm.person1Id || !spouseForm.person2Id) {
      setSpouseMessage({ type: 'error', text: 'Kedua pasangan wajib dipilih.' });
      return;
    }
    if (spouseForm.person1Id === spouseForm.person2Id) {
      setSpouseMessage({ type: 'error', text: 'Tidak bisa memasangkan orang yang sama.' });
      return;
    }
    setSpouseSubmitting(true);
    try {
      const res = await fetch('/api/admin/spouse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person1Id: spouseForm.person1Id,
          person2Id: spouseForm.person2Id,
          status: spouseForm.status,
          tanggalNikah: spouseForm.tanggalNikah || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSpouseMessage({ type: 'error', text: data.error || 'Gagal menyimpan.' });
        return;
      }
      setSpouseMessage({ type: 'ok', text: 'Relasi pasangan berhasil ditambahkan.' });
      setSpouseForm(emptySpouseForm);
      loadAll();
    } catch {
      setSpouseMessage({ type: 'error', text: 'Terjadi kesalahan jaringan.' });
    } finally {
      setSpouseSubmitting(false);
    }
  }

  async function handleSpouseDelete(id: string) {
    if (!confirm('Hapus relasi pasangan ini? Tidak bisa dibatalkan.')) return;
    await fetch(`/api/admin/spouse/${id}`, { method: 'DELETE' });
    loadAll();
  }

  async function handleSpouseStatusChange(id: string, newStatus: string) {
    await fetch(`/api/admin/spouse/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    loadAll();
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage(null);
  }

  async function handleDelete() {
    if (!editingId) return;
    if (!confirm('Hapus (soft-delete) anggota ini? Data tidak hilang permanen, tapi tidak akan muncul lagi di tree.')) return;
    const res = await fetch(`/api/admin/persons/${editingId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      setMessage({ type: 'error', text: data.error || 'Gagal menghapus.' });
      return;
    }
    setMessage({ type: 'ok', text: 'Berhasil dihapus.' });
    cancelEdit();
    loadAll();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!form.nama.trim() || form.urutanKelahiran === '') {
      setMessage({ type: 'error', text: 'Nama dan urutan kelahiran wajib diisi.' });
      return;
    }

    setSubmitting(true);
    try {
      const url = editingId ? `/api/admin/persons/${editingId}` : '/api/admin/persons';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          urutanKelahiran: Number(form.urutanKelahiran),
          tanggalLahir: form.tanggalLahir || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Gagal menyimpan.' });
        return;
      }
      setMessage({ type: 'ok', text: editingId ? `"${form.nama}" berhasil diupdate.` : `"${form.nama}" berhasil ditambahkan.` });
      if (!editingId) setForm(emptyForm);
      loadAll();
    } catch (err) {
      setMessage({ type: 'error', text: 'Terjadi kesalahan jaringan.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '32px 24px 80px',
      }}
    >
      <header style={{ marginBottom: 28, borderBottom: '2px solid var(--color-gold)', paddingBottom: 16 }}>
        <h1 style={{ fontSize: 28, color: 'var(--color-ink)' }}>Silsilah Keluarga — Admin</h1>
        <p style={{ margin: '6px 0 0', opacity: 0.7, fontSize: 14 }}>
          Bangun struktur tree di sini dulu. Halaman ini cuma untuk admin input data dasar —
          tampilan tree yang lebih visual akan dibangun terpisah.
        </p>
        <p style={{ margin: '8px 0 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <a href="#pasangan" style={{ color: 'var(--color-terracotta)', fontSize: 13 }}>
            ↓ Kelola relasi pasangan (di bawah, satu halaman ini)
          </a>
          <a href="/admin/claims" style={{ color: 'var(--color-moss)', fontSize: 13, fontWeight: 600 }}>
            📋 Klaim & permintaan masuk →
          </a>
        </p>
      </header>

      <SubAdminPanel persons={persons} />

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 28 }}>
        {/* FORM */}
        <section
          style={{
            background: 'white',
            border: '1px solid var(--color-line)',
            borderRadius: 8,
            padding: 20,
            boxShadow: 'var(--shadow-card)',
            alignSelf: 'start',
          }}
        >
          <h2 style={{ fontSize: 17, marginBottom: 14 }}>
            {editingId ? 'Edit Anggota' : 'Tambah Anggota'}
          </h2>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Nama">
              <input
                type="text"
                value={form.nama}
                onChange={(e) => setForm({ ...form, nama: e.target.value })}
                style={inputStyle}
                placeholder="Nama lengkap"
              />
            </Field>

            <Field label="Gender">
              <div style={{ display: 'flex', gap: 12 }}>
                {(['L', 'P'] as const).map((g) => (
                  <label key={g} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                    <input
                      type="radio"
                      checked={form.gender === g}
                      onChange={() => setForm({ ...form, gender: g })}
                    />
                    {g === 'L' ? 'Laki-laki' : 'Perempuan'}
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Urutan kelahiran" hint="Urutan di antara saudara dari bapak yang sama">
              <input
                type="number"
                min={1}
                value={form.urutanKelahiran}
                onChange={(e) => setForm({ ...form, urutanKelahiran: e.target.value })}
                style={inputStyle}
                placeholder="1, 2, 3, ..."
              />
            </Field>

            <Field label="Tanggal lahir (opsional)">
              <input
                type="date"
                value={form.tanggalLahir}
                onChange={(e) => setForm({ ...form, tanggalLahir: e.target.value })}
                style={inputStyle}
              />
            </Field>

            <Field label="Bapak (opsional)">
              <PersonCombobox
                options={bapakOptions}
                value={form.bapakId}
                onChange={(id) => setForm({ ...form, bapakId: id })}
                placeholder="Cari nama bapak..."
                emptyLabel="— Tidak ada / belum diketahui —"
              />
            </Field>

            <Field label="Ibu (opsional)">
              <PersonCombobox
                options={ibuOptions}
                value={form.ibuId}
                onChange={(id) => setForm({ ...form, ibuId: id })}
                placeholder="Cari nama ibu..."
                emptyLabel="— Tidak ada / belum diketahui —"
              />
            </Field>

            <Field label="Tipe relasi orang tua">
              <select
                value={form.tipe}
                onChange={(e) => setForm({ ...form, tipe: e.target.value as 'kandung' | 'angkat' })}
                style={inputStyle}
              >
                <option value="kandung">Kandung</option>
                <option value="angkat">Angkat</option>
              </select>
            </Field>

            <Field label="Catatan (opsional)">
              <textarea
                value={form.catatan}
                onChange={(e) => setForm({ ...form, catatan: e.target.value })}
                style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                placeholder="Misal: anak angkat dari keluarga X"
              />
            </Field>

            {message && (
              <div
                style={{
                  fontSize: 13,
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: message.type === 'ok' ? '#e8efe6' : '#f5e2dd',
                  color: message.type === 'ok' ? 'var(--color-moss)' : 'var(--color-danger)',
                }}
              >
                {message.text}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: submitting ? '#c79c8c' : 'var(--color-terracotta)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 14,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!submitting) e.currentTarget.style.background = 'var(--color-terracotta-dark)';
                }}
                onMouseLeave={(e) => {
                  if (!submitting) e.currentTarget.style.background = 'var(--color-terracotta)';
                }}
              >
                {submitting ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Tambah ke Tree'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  style={{
                    padding: '10px 14px',
                    background: 'transparent',
                    border: '1px solid var(--color-line)',
                    borderRadius: 6,
                    fontSize: 14,
                    color: 'var(--color-ink)',
                  }}
                >
                  Batal
                </button>
              )}
            </div>
            {editingId && (
              <button
                type="button"
                onClick={handleDelete}
                style={{
                  marginTop: 2,
                  padding: '8px 14px',
                  background: 'transparent',
                  border: '1px solid var(--color-danger)',
                  borderRadius: 6,
                  fontSize: 13,
                  color: 'var(--color-danger)',
                }}
              >
                Hapus Anggota Ini
              </button>
            )}

            {editingId && persons.find((p) => p.id === editingId)?.hasAccount && (
              <ResetPasswordLinkPanel personId={editingId} />
            )}
          </form>
        </section>

        {/* PREVIEW */}
        <section
          style={{
            background: 'white',
            border: '1px solid var(--color-line)',
            borderRadius: 8,
            padding: 20,
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <h2 style={{ fontSize: 17 }}>Preview Tree ({persons.length} orang)</h2>
            <button
              onClick={loadAll}
              style={{
                fontSize: 12,
                background: 'transparent',
                border: '1px solid var(--color-line)',
                borderRadius: 6,
                padding: '4px 10px',
                color: 'var(--color-moss)',
              }}
            >
              ↻ Refresh
            </button>
          </div>
          <p style={{ fontSize: 12, opacity: 0.55, marginTop: 0, marginBottom: 14 }}>
            Klik nama anggota untuk edit data atau relasinya.
          </p>
          {loading ? (
            <p style={{ opacity: 0.6 }}>Memuat...</p>
          ) : (
            <TreePreview persons={persons} onSelect={handleSelectNode} selectedId={editingId} />
          )}
        </section>
      </div>

      {/* ===== RELASI PASANGAN -- digabung di halaman yg sama (sesuai
          feedback: pisah halaman bikin ribet pas baru nambah org) ===== */}
      <section id="pasangan" style={{ marginTop: 36, paddingTop: 28, borderTop: '2px solid var(--color-gold)' }}>
        <h2 style={{ fontSize: 20, marginBottom: 6 }}>Relasi Pasangan</h2>
        <p style={{ fontSize: 13, opacity: 0.65, marginTop: 0, marginBottom: 18, maxWidth: 700 }}>
          Catat pernikahan di sini. Untuk Bapak-Ibu kandungmu sendiri TIDAK perlu input di sini —
          itu sudah otomatis lewat field Bapak/Ibu di form di atas. Bagian ini khusus pasangan yang
          masuk keluarga lewat pernikahan (bukan hubungan darah), misal istri/suami dari paklik/bulik.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 28 }}>
          <div
            style={{
              background: 'white',
              border: '1px solid var(--color-line)',
              borderRadius: 8,
              padding: 20,
              boxShadow: 'var(--shadow-card)',
              alignSelf: 'start',
            }}
          >
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Tambah Relasi Pasangan</h3>
            <form onSubmit={handleSpouseSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Pasangan 1">
                <PersonCombobox
                  options={persons.map((p) => ({ id: p.id, label: p.nama }))}
                  value={spouseForm.person1Id}
                  onChange={(id) => setSpouseForm({ ...spouseForm, person1Id: id })}
                  placeholder="Cari nama..."
                />
              </Field>
              <Field label="Pasangan 2">
                <PersonCombobox
                  options={persons.map((p) => ({ id: p.id, label: p.nama }))}
                  value={spouseForm.person2Id}
                  onChange={(id) => setSpouseForm({ ...spouseForm, person2Id: id })}
                  placeholder="Cari nama..."
                />
              </Field>
              <Field label="Status">
                <select
                  value={spouseForm.status}
                  onChange={(e) => setSpouseForm({ ...spouseForm, status: e.target.value })}
                  style={inputStyle}
                >
                  <option value="menikah">Menikah (aktif)</option>
                  <option value="cerai">Cerai</option>
                  <option value="wafat">Salah satu wafat</option>
                </select>
              </Field>
              <Field label="Tanggal nikah (opsional)">
                <input
                  type="date"
                  value={spouseForm.tanggalNikah}
                  onChange={(e) => setSpouseForm({ ...spouseForm, tanggalNikah: e.target.value })}
                  style={inputStyle}
                />
              </Field>

              {spouseMessage && (
                <div
                  style={{
                    fontSize: 13,
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: spouseMessage.type === 'ok' ? '#e8efe6' : '#f5e2dd',
                    color: spouseMessage.type === 'ok' ? 'var(--color-moss)' : 'var(--color-danger)',
                  }}
                >
                  {spouseMessage.text}
                </div>
              )}

              <button
                type="submit"
                disabled={spouseSubmitting}
                style={{
                  marginTop: 4,
                  padding: '10px 16px',
                  background: spouseSubmitting ? '#c79c8c' : 'var(--color-terracotta)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                {spouseSubmitting ? 'Menyimpan...' : 'Simpan Relasi'}
              </button>
            </form>
          </div>

          <div
            style={{
              background: 'white',
              border: '1px solid var(--color-line)',
              borderRadius: 8,
              padding: 20,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Daftar Relasi Pasangan ({spouses.length})</h3>
            {loading ? (
              <p style={{ opacity: 0.6 }}>Memuat...</p>
            ) : spouses.length === 0 ? (
              <p style={{ opacity: 0.6, fontStyle: 'italic' }}>Belum ada relasi pasangan tercatat.</p>
            ) : (
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-line)' }}>
                    <th style={{ padding: '6px 4px' }}>Pasangan</th>
                    <th style={{ padding: '6px 4px' }}>Status</th>
                    <th style={{ padding: '6px 4px' }}>Tanggal Nikah</th>
                    <th style={{ padding: '6px 4px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {spouses.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--color-line)' }}>
                      <td style={{ padding: '8px 4px' }}>
                        {s.person1.nama} &amp; {s.person2.nama}
                      </td>
                      <td style={{ padding: '8px 4px' }}>
                        <select
                          value={s.status}
                          onChange={(e) => handleSpouseStatusChange(s.id, e.target.value)}
                          style={{ fontSize: 12, padding: '3px 6px', border: '1px solid var(--color-line)', borderRadius: 4 }}
                        >
                          <option value="menikah">{statusLabel.menikah}</option>
                          <option value="cerai">{statusLabel.cerai}</option>
                          <option value="wafat">{statusLabel.wafat}</option>
                        </select>
                      </td>
                      <td style={{ padding: '8px 4px', opacity: 0.7 }}>
                        {s.tanggalNikah ? String(s.tanggalNikah).slice(0, 10) : '—'}
                      </td>
                      <td style={{ padding: '8px 4px' }}>
                        <button
                          onClick={() => handleSpouseDelete(s.id)}
                          style={{
                            fontSize: 12,
                            background: 'transparent',
                            border: '1px solid var(--color-danger)',
                            color: 'var(--color-danger)',
                            borderRadius: 4,
                            padding: '3px 8px',
                          }}
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
      {label}
      {children}
      {hint && <span style={{ fontWeight: 400, fontSize: 11, opacity: 0.6 }}>{hint}</span>}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--color-line)',
  borderRadius: 'var(--radius)',
  fontSize: 14,
  width: '100%',
};

// Panel "Kelola Sub-Admin" -- cuma render isinya kalau viewer adalah
// super admin (role admin TANPA AdminScope row). Sub-admin (scoped) TIDAK
// boleh grant/revoke scope orang lain -- endpoint-nya sendiri sudah
// menolak (403), tapi UI ini juga disembunyikan supaya nggak menampilkan
// tombol yang bakal gagal kalau dipencet.
function SubAdminPanel({ persons }: { persons: PersonRow[] }) {
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [scopes, setScopes] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadScopes = useCallback(() => {
    fetch('/api/admin/scopes')
      .then((r) => (r.ok ? r.json() : []))
      .then(setScopes)
      .catch(() => setScopes([]));
  }, []);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        const superAdmin = !!me?.isSuperAdmin;
        setIsSuperAdmin(superAdmin);
        if (superAdmin) loadScopes();
      })
      .catch(() => setIsSuperAdmin(false));
  }, [loadScopes]);

  if (!isSuperAdmin) return null;

  // Kandidat sub-admin: person yang sudah punya akun (hasAccount) --
  // logic-nya sama seperti ResetPasswordLinkPanel, orang yang belum pernah
  // klaim+approved tidak punya User row untuk dijadikan admin.
  const candidates = persons.filter((p) => p.hasAccount && p.userId);

  async function handleGrant() {
    if (!selectedUserId || !selectedRootId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/scopes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId, rootPersonId: selectedRootId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Gagal (status ${res.status})`);
      setSelectedUserId(null);
      setSelectedRootId(null);
      loadScopes();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(scopeId: string) {
    if (!confirm('Cabut akses sub-admin ini? Role admin user ini TIDAK otomatis diturunkan ke member -- itu langkah terpisah kalau memang diinginkan.')) return;
    await fetch(`/api/admin/scopes/${scopeId}`, { method: 'DELETE' });
    loadScopes();
  }

  return (
    <section
      style={{
        marginBottom: 24,
        padding: '16px 20px',
        background: 'var(--color-paper-light)',
        border: '1px solid var(--color-line)',
        borderRadius: 'var(--radius)',
      }}
    >
      <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Kelola Sub-Admin</h3>
      <p style={{ margin: '0 0 12px', fontSize: 12, opacity: 0.65 }}>
        Sub-admin cuma bisa kelola anggota dalam cabang keluarga yang jadi tanggung jawabnya --
        keturunan dari root yang dipilih di sini, plus root-nya sendiri. Pasangan yang menikah
        masuk dari luar cabang tetap bisa dicatat.
      </p>

      {scopes.length > 0 && (
        <table style={{ width: '100%', fontSize: 13, marginBottom: 14, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', opacity: 0.6 }}>
              <th style={{ paddingBottom: 6 }}>Sub-Admin</th>
              <th style={{ paddingBottom: 6 }}>Cabang (Root)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {scopes.map((s) => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--color-line)' }}>
                <td style={{ padding: '6px 0' }}>{s.user?.email ?? s.user?.noHpLogin ?? s.userId}</td>
                <td>{s.rootPerson?.nama ?? s.rootPersonId}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    onClick={() => handleRevoke(s.id)}
                    style={{
                      border: 'none', background: 'transparent',
                      color: 'var(--color-danger)', cursor: 'pointer', fontSize: 12,
                    }}
                  >
                    Cabut
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 200 }}>
          <label style={{ display: 'block', fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
            Calon sub-admin (harus sudah punya akun)
          </label>
          <PersonCombobox
            options={candidates.map((p) => ({ id: p.userId as string, label: p.nama }))}
            value={selectedUserId}
            onChange={setSelectedUserId}
            placeholder="Pilih orang..."
          />
        </div>
        <div style={{ minWidth: 200 }}>
          <label style={{ display: 'block', fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
            Root cabang keluarga
          </label>
          <PersonCombobox
            options={persons.map((p) => ({ id: p.id, label: p.nama }))}
            value={selectedRootId}
            onChange={setSelectedRootId}
            placeholder="Pilih root..."
          />
        </div>
        <button
          onClick={handleGrant}
          disabled={loading || !selectedUserId || !selectedRootId}
          style={{
            padding: '8px 16px', background: 'var(--color-moss)', color: 'white',
            border: 'none', borderRadius: 6, fontSize: 13,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Menyimpan...' : 'Jadikan Sub-Admin'}
        </button>
      </div>
      {error && <p style={{ fontSize: 12, color: 'var(--color-danger)', marginTop: 8 }}>{error}</p>}
    </section>
  );
}

// Tombol "Generate link reset password" -- cuma muncul untuk person yang
// sudah punya akun (hasAccount). Link TIDAK dikirim otomatis -- admin
// copy manual lalu kirim lewat WA sendiri (app belum punya domain buat
// email produksi).
function ResetPasswordLinkPanel({ personId }: { personId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ pesanWA: string; linkExpiry: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/admin/persons/${personId}/reset-password-link`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Gagal (status ${res.status})`);
      setResult({ pesanWA: data.pesanWA, linkExpiry: data.linkExpiry });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.pesanWA);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Gagal copy ke clipboard -- copy manual dari teks di bawah.');
    }
  }

  return (
    <div
      style={{
        marginTop: 12,
        padding: '12px 14px',
        border: '1px dashed var(--color-line)',
        borderRadius: 'var(--radius)',
        background: 'var(--color-paper-light)',
      }}
    >
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        style={{
          padding: '8px 14px',
          background: 'transparent',
          border: '1px solid var(--color-moss)',
          borderRadius: 6,
          fontSize: 13,
          color: 'var(--color-moss)',
          cursor: loading ? 'default' : 'pointer',
        }}
      >
        {loading ? 'Membuat link...' : 'Generate Link Reset Password'}
      </button>

      {error && (
        <p style={{ fontSize: 12, color: 'var(--color-danger)', marginTop: 8 }}>{error}</p>
      )}

      {result && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 6px' }}>
            Berlaku sampai {result.linkExpiry}. Copy pesan di bawah, kirim manual lewat WA:
          </p>
          <textarea
            readOnly
            value={result.pesanWA}
            rows={4}
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
          <button
            type="button"
            onClick={handleCopy}
            style={{
              marginTop: 6,
              padding: '6px 12px',
              background: copied ? 'var(--color-moss)' : 'var(--color-terracotta)',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {copied ? 'Tersalin!' : 'Copy Pesan'}
          </button>
        </div>
      )}
    </div>
  );
}