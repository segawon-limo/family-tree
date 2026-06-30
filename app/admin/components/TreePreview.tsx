'use client';

type PersonRow = {
  id: string;
  nama: string;
  gender: string;
  urutanKelahiran: number;
  bapakId: string | null;
  bapakNama: string | null;
  ibuId: string | null;
  ibuNama: string | null;
};

/**
 * Preview sederhana, BUKAN tree view final yang sudah dijanjikan
 * (garis melengkung, layout per-generasi). Ini cuma nested list
 * supaya admin bisa lihat progres input sambil kerja -- tree view
 * sungguhan adalah halaman terpisah, belum dibangun.
 *
 * Simplifikasi yang disengaja: rendering nested cuma ikut jalur
 * BAPAK (kalau ada), ibu ditampilkan sbg label inline saja --
 * supaya tidak ada node ganda kalau dirender dari 2 sisi orang tua.
 */
export default function TreePreview({
  persons,
  onSelect,
  selectedId,
}: {
  persons: PersonRow[];
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}) {
  const roots = persons.filter((p) => !p.bapakId);

  function renderNode(person: PersonRow, depth: number) {
    const children = persons.filter((p) => p.bapakId === person.id);
    const isSelected = person.id === selectedId;
    return (
      <div key={person.id} style={{ marginLeft: depth > 0 ? 20 : 0 }}>
        <div
          onClick={() => onSelect?.(person.id)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            margin: '3px 0',
            background: isSelected ? '#fde9d9' : 'var(--color-paper-light)',
            border: `1px solid ${isSelected ? 'var(--color-terracotta)' : 'var(--color-line)'}`,
            borderLeft: `3px solid ${person.gender === 'L' ? 'var(--color-moss)' : 'var(--color-terracotta)'}`,
            borderRadius: 'var(--radius)',
            fontSize: 13,
            cursor: onSelect ? 'pointer' : 'default',
          }}
        >
          <span style={{ fontWeight: 600 }}>{person.nama}</span>
          <span style={{ opacity: 0.55, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            #{person.urutanKelahiran}
          </span>
          {person.ibuNama && (
            <span style={{ opacity: 0.6, fontSize: 11 }}>(ibu: {person.ibuNama})</span>
          )}
        </div>
        {children.length > 0 && (
          <div style={{ borderLeft: '1px dashed var(--color-gold)', marginLeft: 8, paddingLeft: 4 }}>
            {children
              .sort((a, b) => a.urutanKelahiran - b.urutanKelahiran)
              .map((c) => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  if (persons.length === 0) {
    return <p style={{ opacity: 0.6, fontStyle: 'italic' }}>Belum ada anggota keluarga yang diinput.</p>;
  }

  return <div>{roots.map((r) => renderNode(r, 0))}</div>;
}
