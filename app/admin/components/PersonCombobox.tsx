'use client';

import { useState, useRef, useEffect } from 'react';

type Option = { id: string; label: string };

export default function PersonCombobox({
  options,
  value,
  onChange,
  placeholder,
  emptyLabel,
}: {
  options: Option[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder: string;
  emptyLabel?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        type="text"
        placeholder={selected ? selected.label : placeholder}
        value={open ? query : ''}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 10px',
          border: '1px solid var(--color-line)',
          borderRadius: 'var(--radius)',
          background: selected && !open ? 'var(--color-paper-light)' : 'white',
        }}
      />
      {selected && !open && (
        <button
          type="button"
          onClick={() => onChange(null)}
          title="Hapus pilihan"
          style={{
            position: 'absolute',
            right: 6,
            top: 6,
            border: 'none',
            background: 'transparent',
            color: 'var(--color-terracotta-dark)',
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
      {open && (
        <ul
          style={{
            position: 'absolute',
            zIndex: 20,
            top: '100%',
            left: 0,
            right: 0,
            background: 'white',
            border: '1px solid var(--color-line)',
            borderRadius: 'var(--radius)',
            marginTop: 4,
            maxHeight: 220,
            overflowY: 'auto',
            listStyle: 'none',
            padding: 4,
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {emptyLabel && (
            <li
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              style={{ padding: '6px 8px', cursor: 'pointer', color: 'var(--color-ink)', opacity: 0.6 }}
            >
              {emptyLabel}
            </li>
          )}
          {filtered.length === 0 && (
            <li style={{ padding: '6px 8px', opacity: 0.6 }}>Tidak ditemukan</li>
          )}
          {filtered.map((o) => (
            <li
              key={o.id}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              style={{
                padding: '6px 8px',
                cursor: 'pointer',
                borderRadius: 4,
                background: o.id === value ? 'var(--color-paper)' : 'transparent',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-paper)')}
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = o.id === value ? 'var(--color-paper)' : 'transparent')
              }
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
