'use client';

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

type MapPerson = {
  personId: string;
  nama: string;
  gender: string;
  kecamatan: string | null;
  kabupatenKota: string | null;
  provinsi: string | null;
  latitude: number;
  longitude: number;
};

// Pusat default: tengah Indonesia kira-kira (dipakai kalau belum ada
// marker sama sekali, supaya peta tidak nge-zoom ke 0,0/Samudra Atlantik).
const DEFAULT_CENTER: [number, number] = [-2.5, 118];
const DEFAULT_ZOOM = 5;

export default function MapPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [people, setPeople] = useState<MapPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/map')
      .then((r) => {
        if (!r.ok) throw new Error('Gagal memuat data peta.');
        return r.json();
      })
      .then((data) => setPeople(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading || error || !mapContainerRef.current || mapInstanceRef.current) return;

    // Import dinamis -- leaflet menyentuh `window`, jadi harus dihindari
    // saat SSR/build. useEffect ini cuma jalan di client, jadi aman.
    import('leaflet').then((L) => {
      if (mapInstanceRef.current || !mapContainerRef.current) return;

      // FIX WAJIB: default marker icon Leaflet mereferensikan path relatif
      // ke file gambar (marker-icon.png dkk) yang tidak ke-resolve dengan
      // benar saat di-bundle Webpack/Next.js -- gambarnya 404 diam-diam,
      // hasilnya marker RENDER tapi TIDAK TERLIHAT sama sekali (bukan
      // error yang kelihatan di console dengan jelas). Ini bug umum
      // Leaflet+bundler, bukan spekulasi -- ditemukan dari bug report
      // nyata (marker tidak muncul di peta). Fix: timpa manual ke URL CDN.
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapContainerRef.current).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      mapInstanceRef.current = map;

      // Atribusi WAJIB oleh syarat penggunaan tile OpenStreetMap -- jangan
      // dihapus. https://www.openstreetmap.org/copyright
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      const bounds: [number, number][] = [];
      for (const p of people) {
        const marker = L.marker([p.latitude, p.longitude]).addTo(map);
        const lokasiText = [p.kecamatan, p.kabupatenKota, p.provinsi].filter(Boolean).join(', ');
        marker.bindPopup(`<strong>${escapeHtml(p.nama)}</strong><br/>${escapeHtml(lokasiText || '-')}`);
        bounds.push([p.latitude, p.longitude]);
      }

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
      }
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [loading, error, people]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
      <header
        style={{
          padding: '14px 24px',
          borderBottom: '2px solid var(--color-gold)',
          background: 'var(--color-paper)',
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ fontFamily: 'var(--font-display)', margin: 0, fontSize: 20 }}>Peta Keluarga</h2>
        <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>
          Lokasi ditampilkan di level kecamatan/kabupaten, bukan alamat lengkap.
        </p>
      </header>

      {error && (
        <p style={{ color: 'var(--color-danger)', padding: '12px 24px', margin: 0 }}>{error}</p>
      )}
      {loading ? (
        <p style={{ opacity: 0.6, padding: '12px 24px' }}>Memuat peta...</p>
      ) : people.length === 0 ? (
        <p style={{ opacity: 0.7, padding: '12px 24px' }}>
          Belum ada anggota keluarga dengan lokasi tercatat. Admin bisa mengisi kecamatan/kabupaten lewat halaman Kelola Data Keluarga.
        </p>
      ) : (
        <div ref={mapContainerRef} style={{ flex: 1, width: '100%' }} />
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}