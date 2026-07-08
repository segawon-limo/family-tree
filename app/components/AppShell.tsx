'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { NAV_ITEMS, getPageTitle } from '../nav-config';

const SIDEBAR_COLLAPSE_KEY = 'ft_sidebar_collapsed';
const SIDEBAR_WIDTH_EXPANDED = 220;
const SIDEBAR_WIDTH_COLLAPSED = 64;

type Me = {
  role: 'admin' | 'member';
  personId: string | null;
  personNama: string | null;
  email: string | null;
  fotoUrl: string | null;
};

// Halaman yang TIDAK BOLEH pakai shell (sidebar/topbar), TERLEPAS dari
// status login. Sebelumnya keputusan "tampilkan shell atau tidak" cuma
// berdasarkan hasil /api/auth/me (401 = sembunyikan) -- itu SALAH kalau
// pengunjung kebetulan punya sesi valid sambil buka halaman ini (misal
// admin masih login pas nyoba buka link reset-password sendiri). Halaman
// auth-flow seperti ini harus berdiri sendiri, apa pun status sesinya.
const NO_SHELL_PATHS = ['/', '/login', '/register', '/setup-password', '/reset-password'];

function isNoShellPath(pathname: string): boolean {
  return NO_SHELL_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// Membungkus SEMUA halaman (dipasang di root layout). NO_SHELL_PATHS di
// atas menentukan halaman mana yang tidak pernah dapat shell -- terpisah
// dari hasil fetch /api/auth/me (yang cuma menentukan APA ISI shell-nya,
// bukan APAKAH shell muncul).
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null | 'loading'>('loading');
  const pathname = usePathname();
  const noShell = isNoShellPath(pathname);

  useEffect(() => {
    if (noShell) return; // jangan buang request /api/auth/me kalau shell-nya toh nggak akan dipakai
    fetch('/api/auth/me')
      .then((r) => {
        if (r.status === 401) return null; // memang belum login -- normal di halaman publik
        if (!r.ok) {
          // Status selain 401 (500, dll) BUKAN "belum login" -- itu bug.
          // Jangan disamarkan jadi guest-state, supaya kelihatan di console
          // alih-alih diam-diam nyembunyiin seluruh shell tanpa penjelasan.
          console.error('[AppShell] /api/auth/me gagal dengan status', r.status);
          return r.json().then((body) => {
            throw new Error(body?.error ?? `Server error (status ${r.status})`);
          });
        }
        return r.json();
      })
      .then(setMe)
      .catch((err) => {
        console.error('[AppShell] Gagal ambil sesi:', err.message);
        setMe(null);
      });
  }, [pathname, noShell]); // refetch tiap ganti halaman -- murah, dan jaga2 kalau sesi berubah (mis. abis login)

  if (noShell) return <>{children}</>; // auth-flow pages -- TIDAK PEDULI status sesi, tidak pernah dapat shell
  if (me === 'loading') return null; // hindari flash sidebar sebelum tau status login
  if (me === null) return <>{children}</>; // belum login (untuk halaman selain NO_SHELL_PATHS)

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar role={me.role} pathname={pathname} />
      <ShellBody me={me} pathname={pathname}>
        {children}
      </ShellBody>
    </div>
  );
}

function Sidebar({ role, pathname }: { role: 'admin' | 'member'; pathname: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1');
    setMounted(true);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? '1' : '0');
  }

  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));
  const width = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  return (
    <aside
      style={{
        width,
        flexShrink: 0,
        background: 'var(--color-ink)',
        color: 'var(--color-paper-light)',
        display: 'flex',
        flexDirection: 'column',
        // Cegah "flash" lebar salah sebelum localStorage kebaca di client.
        // Tidak sempurna (masih ada 1 frame lebar default sebelum mounted),
        // tapi acceptable -- solusi sempurna butuh baca localStorage di
        // server (tidak bisa, localStorage cuma ada di browser) atau cookie.
        visibility: mounted ? 'visible' : 'hidden',
        transition: 'width 150ms ease',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: '16px',
          borderBottom: '1px solid rgba(248,244,234,0.12)',
          minHeight: 56,
        }}
      >
        {!collapsed && (
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, whiteSpace: 'nowrap' }}>
            Family Tree
          </span>
        )}
        <button
          onClick={toggle}
          title={collapsed ? 'Perlebar menu' : 'Perkecil menu'}
          style={{
            background: 'transparent',
            border: '1px solid rgba(248,244,234,0.25)',
            color: 'var(--color-paper-light)',
            borderRadius: 'var(--radius)',
            width: 28,
            height: 28,
            cursor: 'pointer',
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>

      <nav style={{ padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {(() => {
          // Cari SATU item yang paling spesifik cocok, bukan biarkan tiap
          // item cek sendiri-sendiri pakai startsWith(). Bug sebelumnya:
          // '/admin/claims' juga startsWith('/admin/'), jadi 'Kelola Data
          // Keluarga' (href '/admin') ikut ke-highlight bareng 'Klaim
          // Masuk' (href '/admin/claims') -- dua-duanya nyala sekaligus.
          // Fix: urutkan href terpanjang dulu, match pertama yang menang.
          const matching = items
            .filter((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
            .sort((a, b) => b.href.length - a.href.length);
          const activeHref = matching[0]?.href;

          return items.map((item) => {
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: collapsed ? '10px 0' : '9px 12px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  borderRadius: 'var(--radius)',
                  textDecoration: 'none',
                  color: active ? 'white' : 'var(--color-paper-light)',
                  background: active ? 'var(--color-terracotta)' : 'transparent',
                  fontSize: 14,
                  fontWeight: active ? 600 : 400,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
              >
                {collapsed ? item.label.charAt(0) : item.label}
              </Link>
            );
          });
        })()}
      </nav>
    </aside>
  );
}

function ShellBody({
  me,
  pathname,
  children,
}: {
  me: Me;
  pathname: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Topbar me={me} pathname={pathname} />
      <Suspense fallback={null}>
        <DeniedBanner />
      </Suspense>
      <main style={{ flex: 1, background: 'var(--color-paper)' }}>{children}</main>
    </div>
  );
}

// Muncul kalau middleware barusan redirect dari halaman admin-only karena
// role bukan admin (lihat middleware.ts). Tanpa ini, redirect ke /tree
// kelihatan seperti tidak terjadi apa-apa -- membingungkan, bukan cuma
// "kurang informatif".
function DeniedBanner() {
  const searchParams = useSearchParams();
  const denied = searchParams.get('denied');
  const [dismissed, setDismissed] = useState(false);

  if (denied !== 'admin-only' || dismissed) return null;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 20px',
        background: '#fdf1ec',
        borderBottom: '1px solid var(--color-terracotta)',
        color: 'var(--color-danger)',
        fontSize: 13,
      }}
    >
      <span>Halaman itu khusus admin. Kamu diarahkan kembali ke sini.</span>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--color-danger)',
          cursor: 'pointer',
          fontSize: 16,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}

function Topbar({ me, pathname }: { me: Me; pathname: string }) {
  const title = getPageTitle(pathname);

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        height: 56,
        background: 'var(--color-paper-light)',
        borderBottom: '1px solid var(--color-line)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 18,
          margin: 0,
          color: 'var(--color-ink)',
        }}
      >
        {title}
      </h2>
      <AccountMenu me={me} />
    </header>
  );
}

function AccountMenu({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Tetap redirect ke /login walau request logout gagal (network dll)
      // -- lebih aman treat sebagai "logged out" di sisi client.
    }
    window.location.href = '/login';
  }

  const displayName = me.personNama ?? (me.role === 'admin' ? 'Admin' : 'Anggota');
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={displayName}
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '1px solid var(--color-line)',
          background: me.fotoUrl ? `url(${me.fotoUrl}) center/cover` : 'var(--color-terracotta)',
          color: 'white',
          fontWeight: 600,
          fontSize: 14,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!me.fotoUrl && initial}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: 8,
            minWidth: 200,
            background: 'white',
            border: '1px solid var(--color-line)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-card)',
            overflow: 'hidden',
            zIndex: 20,
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--color-line)',
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{displayName}</div>
            {me.email && (
              <div style={{ opacity: 0.6, fontSize: 12, marginTop: 2 }}>{me.email}</div>
            )}
          </div>
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            style={{
              display: 'block',
              padding: '10px 14px',
              fontSize: 14,
              color: 'var(--color-ink)',
              textDecoration: 'none',
            }}
          >
            Edit Akun
          </Link>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '10px 14px',
              fontSize: 14,
              border: 'none',
              background: 'transparent',
              color: 'var(--color-danger)',
              cursor: loggingOut ? 'default' : 'pointer',
              opacity: loggingOut ? 0.6 : 1,
            }}
          >
            {loggingOut ? 'Keluar...' : 'Logout'}
          </button>
        </div>
      )}
    </div>
  );
}