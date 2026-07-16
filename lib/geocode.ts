// lib/geocode.ts
//
// Geocoding pakai Nominatim (OpenStreetMap), open-source & gratis.
// Kebijakan penggunaan mereka: maksimum 1 request/detik, WAJIB User-Agent
// yang jelas, WAJIB atribusi ke OpenStreetMap di tempat hasilnya
// ditampilkan (lihat app/map/page.tsx), DILARANG query sistematis/bulk.
// https://operations.osmfoundation.org/policies/nominatim/
//
// Throttle di sini cuma level SATU PROSES Node.js (module-level timestamp).
// Kalau nanti app di-deploy multi-instance/horizontal scaling, throttle ini
// TIDAK efektif lintas instance -- perlu diganti throttle terpusat (mis.
// Redis) kalau itu terjadi. Untuk skala app ini (satu instance, geocoding
// dipicu manual sesekali oleh admin lewat form, bukan bulk), ini cukup.
let lastCallAt = 0;
async function throttle() {
  const now = Date.now();
  const elapsed = now - lastCallAt;
  const minGap = 1100; // sedikit di atas 1 detik untuk margin aman
  if (elapsed < minGap) {
    await new Promise((r) => setTimeout(r, minGap - elapsed));
  }
  lastCallAt = Date.now();
}

export type GeocodeResult = { latitude: number; longitude: number } | null;

async function nominatimSearch(query: string): Promise<GeocodeResult> {
  await throttle();
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      // WAJIB oleh kebijakan Nominatim -- ganti domain di bawah kalau
      // sudah punya domain production yang tetap.
      'User-Agent': 'family-tree-app/1.0 (contact: admin keluarga -- ganti sesuai kebutuhan)',
    },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => []);
  if (!Array.isArray(data) || data.length === 0) return null;
  const lat = parseFloat(data[0].lat);
  const lon = parseFloat(data[0].lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { latitude: lat, longitude: lon };
}

// Coba geocode level kecamatan dulu (paling presisi yang kita izinkan),
// fallback ke kabupaten/kota kalau kecamatan tidak ketemu/tidak diisi.
// Selalu tambahkan ", Indonesia" supaya tidak salah negara untuk nama
// kecamatan yang kebetulan sama dengan tempat lain di dunia.
export async function geocodeKecamatanOrKabupaten(params: {
  kecamatan?: string | null;
  kabupatenKota?: string | null;
  provinsi?: string | null;
}): Promise<GeocodeResult> {
  const { kecamatan, kabupatenKota, provinsi } = params;

  if (kecamatan && kecamatan.trim()) {
    const q = [kecamatan, kabupatenKota, provinsi, 'Indonesia'].filter(Boolean).join(', ');
    const hasil = await nominatimSearch(q);
    if (hasil) return hasil;
    // Kecamatan gagal ketemu -- lanjut fallback ke kabupaten/kota di bawah,
    // JANGAN return null langsung.
  }

  if (kabupatenKota && kabupatenKota.trim()) {
    const q = [kabupatenKota, provinsi, 'Indonesia'].filter(Boolean).join(', ');
    return nominatimSearch(q);
  }

  return null;
}