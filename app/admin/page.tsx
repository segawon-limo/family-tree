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
    const [pRes, sRes] = await Promise.all([fetch('/api/admin/persons'), fetch('/api/admin/spouse')]);
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
    const res = await fetch(`/api/admin/persons/${id}`);
    if (!res.ok) {
      setMessage({ type: 'error', text: 'Gagal memuat data untuk diedit.' });
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