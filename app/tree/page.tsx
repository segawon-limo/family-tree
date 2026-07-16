'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { computeLayout, LayoutNode, LayoutEdge, PersonRow, SpouseRow } from '@/lib/treeLayout';

const COL_W = 190;
const ROW_H = 160;
const CARD_W = 150;
const CARD_H = 56;
const PAD = 80;

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.2;

const MINIMAP_W = 280;
const MINIMAP_H = 200;

// PENTING: scale X dan Y HARUS sama (uniform), bukan dihitung terpisah
// (MINIMAP_W/worldWidth vs MINIMAP_H/worldHeight) -- kalau terpisah,
// rasio world yang lebar-pendek (tree biasanya jauh lebih lebar dari
// tinggi) jadi DISTORSI saat digambar di panel minimap yang rasionya
// beda, bikin kotak viewport (yang sebenarnya landscape mengikuti
// browser) malah kelihatan portrait/kepanjangan ke atas. Ditemukan dari
// bug report nyata. `scale` dipakai utk X & Y sekaligus, sisa ruang di
// salah satu sumbu di-center pakai offsetX/offsetY (letterbox), BUKAN
// di-stretch.
function minimapTransform(worldW: number, worldH: number) {
  const scale = Math.min(MINIMAP_W / worldW, MINIMAP_H / worldH);
  const offsetX = (MINIMAP_W - worldW * scale) / 2;
  const offsetY = (MINIMAP_H - worldH * scale) / 2;
  return { scale, offsetX, offsetY };
}

type Viewport = { scrollLeft: number; scrollTop: number; clientWidth: number; clientHeight: number };

export default function TreeViewPage() {
  const router = useRouter();
  const [persons, setPersons] = useState<PersonRow[]>([]);
  const [spouses, setSpouses] = useState<SpouseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [panggilanMap, setPanggilanMap] = useState<Record<string, string>>({});
  const [panggilanLoading, setPanggilanLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const [viewport, setViewport] = useState<Viewport>({ scrollLeft: 0, scrollTop: 0, clientWidth: 0, clientHeight: 0 });
  const updateViewport = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewport({ scrollLeft: el.scrollLeft, scrollTop: el.scrollTop, clientWidth: el.clientWidth, clientHeight: el.clientHeight });
  }, []);

  const panState = useRef<{ startX: number; startY: number; startScrollLeft: number; startScrollTop: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  function handleBackgroundMouseDown(e: React.MouseEvent) {
    if (e.target !== e.currentTarget) return;
    const el = scrollRef.current;
    if (!el) return;
    panState.current = { startX: e.clientX, startY: e.clientY, startScrollLeft: el.scrollLeft, startScrollTop: el.scrollTop };
    setIsPanning(true);
  }

  useEffect(() => {
    function handleMove(e: MouseEvent) {
      if (!panState.current || !scrollRef.current) return;
      const { startX, startY, startScrollLeft, startScrollTop } = panState.current;
      scrollRef.current.scrollLeft = startScrollLeft - (e.clientX - startX);
      scrollRef.current.scrollTop = startScrollTop - (e.clientY - startY);
    }
    function handleUp() {
      panState.current = null;
      setIsPanning(false);
    }
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  useEffect(() => {
    updateViewport();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      el.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, [updateViewport, loading]);

  const zoomAt = useCallback((newZoomRaw: number, clientX?: number, clientY?: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoomRaw));
    const oldZoom = zoomRef.current;
    if (newZoom === oldZoom) return;
    const rect = el.getBoundingClientRect();
    const mouseX = clientX !== undefined ? clientX - rect.left : el.clientWidth / 2;
    const mouseY = clientY !== undefined ? clientY - rect.top : el.clientHeight / 2;
    const worldX = (el.scrollLeft + mouseX) / oldZoom;
    const worldY = (el.scrollTop + mouseY) / oldZoom;
    setZoom(newZoom);
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollLeft = worldX * newZoom - mouseX;
      scrollRef.current.scrollTop = worldY * newZoom - mouseY;
      updateViewport();
    });
  }, [updateViewport]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const delta = -e.deltaY * 0.0015;
      zoomAt(zoomRef.current * (1 + delta), e.clientX, e.clientY);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [loading, zoomAt]);

  useEffect(() => {
    Promise.all([fetch('/api/admin/persons').then((r) => r.json()), fetch('/api/admin/spouse').then((r) => r.json())])
      .then(([p, s]) => {
        setPersons(p);
        setSpouses(s.map((row: any) => ({ person1Id: row.person1Id, person2Id: row.person2Id, status: row.status })));
        setLoading(false);
      });
  }, []);

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

  function px(n: LayoutNode) {
    return basePx(n);
  }

  function pxById(id: string) {
    const n = nodeById.get(id);
    return n ? px(n) : null;
  }

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

  function navigateMinimapTo(clickX: number, clickY: number) {
    const el = scrollRef.current;
    if (!el) return;
    const { scale, offsetX, offsetY } = minimapTransform(width, height);
    const worldX = (clickX - offsetX) / scale;
    const worldY = (clickY - offsetY) / scale;
    el.scrollLeft = worldX * zoom - el.clientWidth / 2;
    el.scrollTop = worldY * zoom - el.clientHeight / 2;
  }

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
            Arahkan kursor ke nama untuk menyorot garis keturunan & pasangannya. Scroll mouse untuk
            zoom, klik-tarik area kosong untuk geser pandangan.{' '}
            <a href="/admin" style={{ color: 'var(--color-terracotta)' }}>
              Edit data →
            </a>
          </p>
          <p style={{ margin: '6px 0 0', opacity: 0.55, fontSize: 11 }}>
            Warna border = gender (<span style={{ color: 'var(--color-male)' }}>biru laki-laki</span>,{' '}
            <span style={{ color: 'var(--color-female)' }}>pink perempuan</span>). Garis{' '}
            <strong style={{ fontWeight: 600 }}>putus-putus</strong> = menikah masuk (belum/tidak
            punya garis keturunan sendiri di tree ini). Garis penuh = garis darah.
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
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => zoomAt(zoom - ZOOM_STEP)} style={zoomBtnStyle} title="Perkecil">
              −
            </button>
            <button
              onClick={() => zoomAt(1)}
              style={{ ...zoomBtnStyle, width: 'auto', padding: '0 10px', fontSize: 12 }}
              title="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={() => zoomAt(zoom + ZOOM_STEP)} style={zoomBtnStyle} title="Perbesar">
              +
            </button>
          </div>
        </div>
      </header>

      {/* Wrapper relative INI yang jadi acuan posisi minimap (absolute),
          BUKAN position:fixed ke seluruh browser viewport -- supaya minimap
          selalu nempel di pojok kiri-bawah AREA CANVAS TREE, ikut geser
          kalau sidebar collapse/expand (lebar sidebar berubah), bukan
          diam di titik tetap layar. Ditemukan dari bug report nyata
          (minimap dulu fixed ke viewport, jadi ketutup/salah posisi kalau
          sidebar melebar). */}
      <div style={{ position: 'relative' }}>
        <div
          ref={scrollRef}
          style={{ overflow: 'auto', padding: 24, position: 'relative', height: 'calc(100vh - 130px)' }}
        >
        <div style={{ width: width * zoom, height: height * zoom }}>
          <div
            onMouseDown={handleBackgroundMouseDown}
            style={{
              position: 'relative',
              width,
              height,
              transform: `scale(${zoom})`,
              transformOrigin: '0 0',
              cursor: isPanning ? 'grabbing' : 'grab',
            }}
          >
            <svg
              width={width}
              height={height}
              style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            >
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
                  : `M ${p1.x} ${p1.y} Q ${(p1.x + p2.x) / 2} ${(p1.y + p2.y) / 2}, ${p2.x} ${p2.y}`;
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
                  onClick={() => router.push(`/person/${n.id}`)}
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
                    boxShadow: 'var(--shadow-card)',
                    opacity: dim ? 0.35 : 1,
                    transition: 'opacity 0.15s, transform 0.15s',
                    transform: hoveredId === n.id ? 'scale(1.06)' : 'scale(1)',
                    fontFamily: 'var(--font-display)',
                    zIndex: hoveredId === n.id ? 5 : 1,
                    cursor: 'pointer',
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

            {hoveredId && (() => {
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
                    pointerEvents: 'none',
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
        </div>

        <Minimap
          nodes={layout.nodes}
          px={px}
          worldWidth={width}
          worldHeight={height}
          zoom={zoom}
          viewport={viewport}
          onNavigate={navigateMinimapTo}
        />
      </div>
    </main>
  );
}

const zoomBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  border: '1px solid var(--color-line)',
  borderRadius: 6,
  background: 'white',
  fontSize: 16,
  lineHeight: 1,
  cursor: 'pointer',
  color: 'var(--color-ink)',
};

function Minimap({
  nodes,
  px,
  worldWidth,
  worldHeight,
  zoom,
  viewport,
  onNavigate,
}: {
  nodes: LayoutNode[];
  px: (n: LayoutNode) => { x: number; y: number };
  worldWidth: number;
  worldHeight: number;
  zoom: number;
  viewport: Viewport;
  onNavigate: (x: number, y: number) => void;
}) {
  const minimapRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const { scale, offsetX, offsetY } = minimapTransform(worldWidth, worldHeight);

  function handleMouseDown(e: React.MouseEvent) {
    draggingRef.current = true;
    const el = minimapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), MINIMAP_W);
    const y = Math.min(Math.max(e.clientY - rect.top, 0), MINIMAP_H);
    onNavigate(x, y);
  }

  useEffect(() => {
    function handleMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const el = minimapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = Math.min(Math.max(e.clientX - rect.left, 0), MINIMAP_W);
      const y = Math.min(Math.max(e.clientY - rect.top, 0), MINIMAP_H);
      onNavigate(x, y);
    }
    function handleUp() {
      draggingRef.current = false;
    }
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [onNavigate]);

  const visibleWorldX = viewport.scrollLeft / zoom;
  const visibleWorldY = viewport.scrollTop / zoom;
  const visibleWorldW = viewport.clientWidth / zoom;
  const visibleWorldH = viewport.clientHeight / zoom;

  const rectX = visibleWorldX * scale + offsetX;
  const rectY = visibleWorldY * scale + offsetY;
  const rectW = Math.min(visibleWorldW * scale, MINIMAP_W);
  const rectH = Math.min(visibleWorldH * scale, MINIMAP_H);

  return (
    <div
      ref={minimapRef}
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        left: 20,
        bottom: 20,
        width: MINIMAP_W,
        height: MINIMAP_H,
        background: 'var(--color-paper-light)',
        border: '2px solid var(--color-gold)',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(43,38,32,0.25)',
        cursor: 'pointer',
        overflow: 'hidden',
        zIndex: 40,
      }}
      title="Klik atau tarik untuk navigasi"
    >
      {nodes.map((n) => {
        const p = px(n);
        return (
          <div
            key={n.id}
            style={{
              position: 'absolute',
              left: p.x * scale + offsetX - 1.5,
              top: p.y * scale + offsetY - 1.5,
              width: 3,
              height: 3,
              borderRadius: '50%',
              background: n.gender === 'L' ? 'var(--color-male)' : 'var(--color-female)',
            }}
          />
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: rectX,
          top: rectY,
          width: rectW,
          height: rectH,
          border: '1.5px solid var(--color-terracotta)',
          background: 'rgba(200,120,80,0.12)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}