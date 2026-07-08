// Konfigurasi menu navigasi -- SATU sumber kebenaran dipakai AppShell
// (sidebar + judul topbar). Kalau nambah halaman baru yang butuh login,
// tambahkan di sini juga supaya muncul di sidebar & topbar-nya benar.
//
// CATATAN: `roles` di sini cuma ngatur tampilan (sembunyikan link di
// sidebar). Proteksi ASLI tetap harus di level API/halaman itu sendiri
// (lihat requireAdmin() di lib/auth.ts) -- menyembunyikan link BUKAN
// kontrol akses, cuma UX. Jangan anggap ini cukup buat "admin-only".
export type NavItem = {
  href: string;
  label: string;
  roles: Array<'admin' | 'member'>;
};

export const NAV_ITEMS: NavItem[] = [
  { href: '/tree', label: 'Silsilah', roles: ['admin', 'member'] },
  { href: '/admin', label: 'Kelola Data Keluarga', roles: ['admin'] },
  { href: '/admin/claims', label: 'Klaim Masuk', roles: ['admin'] },
  { href: '/panggilan', label: 'Kalkulator Panggilan', roles: ['admin', 'member'] },
];

// Halaman yang butuh login tapi TIDAK muncul di sidebar (misal halaman
// akun sendiri, diakses lewat dropdown, bukan menu utama) -- tetap perlu
// entry di sini supaya topbar bisa nampilin judul yang benar.
const EXTRA_TITLES: Record<string, string> = {
  '/account': 'Akun Saya',
};

export function getPageTitle(pathname: string): string {
  // Cari match PERSIS dulu, baru fallback ke prefix (misal /admin/claims/xyz)
  const exact = NAV_ITEMS.find((item) => item.href === pathname);
  if (exact) return exact.label;
  if (EXTRA_TITLES[pathname]) return EXTRA_TITLES[pathname];

  const byPrefix = NAV_ITEMS.find((item) => pathname.startsWith(item.href + '/'));
  if (byPrefix) return byPrefix.label;

  return 'Family Tree';
}