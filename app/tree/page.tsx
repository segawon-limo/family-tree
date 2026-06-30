'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { computeLayout, LayoutNode, LayoutEdge, PersonRow, SpouseRow } from '@/lib/treeLayout';

const COL_W = 190;
const ROW_H = 160;
const CARD_W = 150;
const CARD_H = 56;
const PAD = 80;

type Offset = { dx: number; dy: number };

export default function TreeViewPage() {
  const [persons, setPersons] = useState<PersonRow[]>([]);
  const [spouses, setSpouses] = useState<SpouseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // "Lihat dari sudut pandang siapa" -- pengganti SEMENTARA utk
  // session/login asli (JWT middleware belum ada, lihat backlog #4).
  // Dipilih manual dari dropdown supaya panggilan ("kamu manggil dia
  // apa") bisa ditampilkan di preview card. Begitu auth beneran ada,
  // ini HARUS diganti baca dari session.personId, bukan dropdown bebas
  // -- dropdown bebas berarti siapapun bisa "menyamar" jadi orang lain
  // di tampilan (read-only, tidak mengubah data, tapi tetap bukan
  // perilaku yang benar utk versi production).
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [panggilanMap, setPanggilanMap] = useState<Record<string, string>>({});
  const [panggilanLoading, setPanggilanLoading] = useState(false);

  // Posisi custom dari drag -- HANYA di memori browser (sengaja belum
  // disimpan ke database, belum ada kolom utk itu di skema). Reset
  // setiap reload halaman. Kalau nanti mau permanen, perlu kolom
  // posX/posY custom di tabel person + endpoint PATCH baru.
  const [offsets, setOffsets] = useState<Record<string, Offset>>({});
  const dragState = useRef<{ id: string; startX: number; startY: number; baseDx: number; baseDy: number } | null>(
    null
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetch('/api/admin/persons').then((r) => r.json()), fetch('/api/admin/spouse').then((r) => r.json())])
      .then(([p, s]) => {
        setPersons(p);
        setSpouses(s.map((row: any) => ({ person1Id: row.person1Id, person2Id: row.person2Id, status: row.status })));
        setLoading(false);
      });
  }, []);

  // Hitung SEMUA panggilan dari viewer sekali setiap viewer berganti --
  // BUKAN dipanggil ulang tiap hover. Lihat catatan performa di
  // app/api/panggilan/[fromId]/route.ts.
  useEffect(() => {
    if (!viewerId) {
      setPanggilanMap({});
      return;
    }
    setPanggilanLoading(true);
    fetch(`/api/panggilan/${viewerId}`)
      .then((r) => r.json())
      .then((data) => setPanggilanMap(data))
      .finally(() => setPanggilanLoading(false));
  }, [viewerId]);

  const handlePointerDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      const current = offsets[id] ?? { dx: 0, dy: 0 };
      dragState.current = { id, startX: e.clientX, startY: e.clientY, baseDx: current.dx, baseDy: current.dy };
      setDraggingId(id);
    },
    [offsets]
  );

  useEffect(() => {
    function handleMove(e: MouseEvent) {
      if (!dragState.current) return;
      const { id, startX, startY, baseDx, baseDy } = dragState.current;
      const dx = baseDx + (e.clientX - startX);
      const dy = baseDy + (e.clientY - startY);
      setOffsets((prev) => ({ ...prev, [id]: { dx, dy } }));
    }
    function handleUp() {
      dragState.current = null;
      setDraggingId(null);
    }
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  if (loading) {
    return (
      <main style={{ padding: 40 }}>
        <p style={{ opacity: 0.6 }}>Memuat tree...</p>
      </main>
    );
  }

  const layout = computeLayout(persons, spouses);
  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));

  const width = (layout.maxX + 1) * COL_W + PAD * 2 + 300;
  const height = (layout.maxGeneration + 1) * ROW_H + PAD * 2 + 300;

  function basePx(n: LayoutNode) {
    return { x: PAD + n.x * COL_W + CARD_W / 2, y: PAD + n.generation * ROW_H + CARD_H / 2 };
  }

  // Posisi final = posisi dasar dari layout + offset hasil drag (kalau ada)
  function px(n: LayoutNode) {
    const base = basePx(n);
    const off = offsets[n.id];
    return off ? { x: base.x + off.dx, y: base.y + off.dy } : base;
  }

  function pxById(id: string) {
    const n = nodeById.get(id);
    return n ? px(n) : null;
  }

  // Titik tengah pasangan -- X DAN Y, memperhitungkan offset drag kedua
  // belah pihak. Sebelumnya cuma hitung X (Y ikut posisi "from" sendiri),
  // makanya garis ke anak kelihatan "putus" dari garis pasangan begitu
  // salah satu pasangan digeser secara vertikal -- kuncinya: titik awal
  // garis cabang harus benar2 di TENGAH garis pasangan (X & Y), bukan
  // cuma sejajar X dgn Y milik salah satu orang saja.
  function coupleMidPx(id: string): { x: number; y: number } | null {
    if (!(id in layout.coupleMidX)) return null;
    const edge = layout.spouseEdges.find((e) => e.fromId === id || e.toId === id);
    if (!edge) return null;
    const partnerId = edge.fromId === id ? edge.toId : edge.fromId;
    const p1 = pxById(id);
    const p2 = pxById(partnerId);
    if (!p1 || !p2) return null;
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }

  function relatedIds(id: string): Set<string> {
    const rel = new Set<string>([id]);
    for (const e of layout.parentEdges) {
      if (e.fromId === id) rel.add(e.toId);
      if (e.toId === id) rel.add(e.fromId);
    }
    for (const e of layout.spouseEdges) {
      if (e.fromId === id) rel.add(e.toId);
      if (e.toId === id) rel.add(e.fromId);
    }
    return rel;
  }

  const highlighted = hoveredId ? relatedIds(hoveredId) : null;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--color-paper)' }}>
      <header
        style={{
          padding: '24px 32px 16px',
          borderBottom: '2px solid var(--color-gold)',
          position: 'sticky',
          top: 0,
          background: 'var(--color-paper)',
          zIndex: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <h1 style={{ fontSize: 26 }}>Silsilah Keluarga</h1>
          <p style={{ margin: '4px 0 0', opacity: 0.65, fontSize: 13 }}>
            Arahkan kursor ke nama untuk menyorot garis keturunan & pasangannya. Tarik (drag) kartu
            untuk atur ulang posisi tampilan.{' '}
            <a href="/admin" style={{ color: 'var(--color-terracotta)' }}>
              Edit data →
            </a>
          </p>
          <p style={{ margin: '6px 0 0', opacity: 0.55, fontSize: 11 }}>
            Warna border = gender (<span style={{ color: 'var(--color-male)' }}>biru laki-laki</span>,{' '}
            <span style={{ color: 'var(--color-female)' }}>pink perempuan</span>). Garis{' '}
            <strong style={{ fontWeight: 600 }}>putus-putus</strong> = menikah masuk (belum/tidak
            punya garis keturunan sendiri di tree ini). Garis penuh = garis darah.
            <br />
            Catatan: posisi hasil geser <strong>belum tersimpan permanen</strong> — reset tiap reload
            halaman (belum ada tempat di database utk menyimpan posisi custom).
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <span style={{ opacity: 0.6 }}>Lihat dari sudut pandang siapa? (sementara, belum ada login)</span>
            <select
              value={viewerId ?? ''}
              onChange={(e) => setViewerId(e.target.value || null)}
              style={{
                fontSize: 13,
                padding: '6px 10px',
                border: '1px solid var(--color-line)',
                borderRadius: 6,
                minWidth: 200,
              }}
            >
              <option value="">— Pilih untuk lihat panggilan —</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                </option>
              ))}
            </select>
          </label>
          {Object.keys(offsets).length > 0 && (
            <button
              onClick={() => setOffsets({})}
              style={{
                fontSize: 12,
                background: 'transparent',
                border: '1px solid var(--color-line)',
                borderRadius: 6,
                padding: '6px 12px',
                color: 'var(--color-moss)',
                whiteSpace: 'nowrap',
              }}
            >
              ↺ Reset posisi
            </button>
          )}
        </div>
      </header>

      <div style={{ overflow: 'auto', padding: 24 }}>
        <div style={{ position: 'relative', width, height }}>
          <svg
            width={width}
            height={height}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          >
            {/* garis generasi (penggaris horizontal halus) */}
            {Array.from({ length: layout.maxGeneration + 1 }).map((_, gen) => (
              <line
                key={`gen-line-${gen}`}
                x1={20}
                y1={PAD + gen * ROW_H + CARD_H / 2}
                x2={width - 20}
                y2={PAD + gen * ROW_H + CARD_H / 2}
                stroke="var(--color-line)"
                strokeWidth={1}
                strokeDasharray="2 6"
              />
            ))}

            {/* garis keturunan: bezier organik, berangkat dari TITIK TENGAH
                pasangan suami-istri (kalau ada & sejajar), bukan dari salah
                satu individu saja -- sesuai permintaan revisi */}
            {layout.parentEdges.map((e, i) => {
              const from = nodeById.get(e.fromId);
              const to = nodeById.get(e.toId);
              if (!from || !to) return null;
              const p1 = px(from);
              const p2 = px(to);
              const mid = coupleMidPx(e.fromId);
              const startX = mid?.x ?? p1.x;
              const startY = mid?.y ?? p1.y + CARD_H / 2;
              const dim = highlighted && (!highlighted.has(e.fromId) || !highlighted.has(e.toId));
              const midY = (startY + p2.y) / 2;
              const path = `M ${startX} ${startY} C ${startX} ${midY}, ${p2.x} ${midY}, ${p2.x} ${p2.y - CARD_H / 2}`;
              return (
                <path
                  key={`pe-${i}`}
                  d={path}
                  fill="none"
                  stroke="var(--color-gold)"
                  strokeWidth={dim ? 1 : 2}
                  opacity={dim ? 0.25 : 0.9}
                />
              );
            })}

            {/* garis pasangan: SOLID & jelas (bukan putus-putus tipis) --
                ini garis ikatan nikah, beda fungsi dari garis keturunan
                makanya beda warna (terracotta) & beda bentuk (lurus pendek,
                bukan lengkung panjang) */}
            {layout.spouseEdges.map((e, i) => {
              const from = nodeById.get(e.fromId);
              const to = nodeById.get(e.toId);
              if (!from || !to) return null;
              const p1 = px(from);
              const p2 = px(to);
              const dim = highlighted && (!highlighted.has(e.fromId) || !highlighted.has(e.toId));
              const sameGen = from.generation === to.generation;
              const d = sameGen
                ? `M ${p1.x + CARD_W / 2} ${p1.y} L ${p2.x - CARD_W / 2} ${p2.y}`
                : `M ${p1.x} ${p1.y} Q ${(p1.x + p2.x) / 2} ${(p1.y + p2.y) / 2}, ${p2.x} ${p2.y}`; // beda generasi/subtree independen -- digambar sbg garis putus2 sbg sinyal "lintas tree"
              return (
                <path
                  key={`se-${i}`}
                  d={d}
                  fill="none"
                  stroke="var(--color-terracotta)"
                  strokeWidth={dim ? 1.5 : 2.5}
                  strokeDasharray={sameGen ? undefined : '5 4'}
                  opacity={dim ? 0.25 : 0.95}
                />
              );
            })}
          </svg>

          {layout.nodes.map((n) => {
            const pos = px(n);
            const dim = highlighted && !highlighted.has(n.id);
            return (
              <div
                key={n.id}
                onMouseEnter={() => setHoveredId(n.id)}
                onMouseLeave={() => setHoveredId(null)}
                onMouseDown={(e) => handlePointerDown(e, n.id)}
                style={{
                  position: 'absolute',
                  left: pos.x - CARD_W / 2,
                  top: pos.y - CARD_H / 2,
                  width: CARD_W,
                  height: CARD_H,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'white',
                  border: `2px ${n.isMarriedIn ? 'dashed' : 'solid'} ${
                    n.gender === 'L' ? 'var(--color-male)' : 'var(--color-female)'
                  }`,
                  borderRadius: 10,
                  boxShadow: draggingId === n.id ? '0 6px 16px rgba(43,38,32,0.25)' : 'var(--shadow-card)',
                  cursor: draggingId === n.id ? 'grabbing' : 'grab',
                  opacity: dim ? 0.35 : 1,
                  transition: draggingId === n.id ? 'none' : 'opacity 0.15s, transform 0.15s',
                  transform: hoveredId === n.id && draggingId !== n.id ? 'scale(1.06)' : 'scale(1)',
                  fontFamily: 'var(--font-display)',
                  zIndex: draggingId === n.id ? 20 : hoveredId === n.id ? 5 : 1,
                  userSelect: 'none',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'center', lineHeight: 1.2, padding: '0 6px' }}>
                  {n.nama}
                </span>
                {n.isMarriedIn && (
                  <span style={{ fontSize: 9, opacity: 0.5, fontFamily: 'var(--font-body)' }}>menikah masuk</span>
                )}
              </div>
            );
          })}

          {/* Preview card on hover -- foto (placeholder kalau belum ada),
              nama, dan panggilan relatif ke viewer yang dipilih di atas.
              TIDAK ditampilkan saat drag aktif, supaya tidak menutupi
              kartu yang sedang digeser. */}
          {hoveredId && !draggingId && (() => {
            const n = nodeById.get(hoveredId);
            if (!n) return null;
            const pos = px(n);
            const panggilan = viewerId ? panggilanMap[hoveredId] : null;
            return (
              <div
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y - CARD_H / 2 - 12,
                  transform: 'translate(-50%, -100%)',
                  background: 'white',
                  border: '1px solid var(--color-line)',
                  borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(43,38,32,0.18)',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  pointerEvents: 'none', // jangan ganggu mouse event kartu di bawahnya
                  zIndex: 30,
                  whiteSpace: 'nowrap',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: n.gender === 'L' ? 'var(--color-male)' : 'var(--color-female)',
                    opacity: n.fotoUrl ? 1 : 0.25,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {n.fotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    n.nama.charAt(0).toUpperCase()
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{n.nama}</span>
                  {viewerId && (
                    <span style={{ fontSize: 12, opacity: 0.6 }}>
                      {panggilanLoading ? 'menghitung panggilan...' : panggilan ?? '—'}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </main>
  );
}