import { useEffect, useRef, useState } from 'react';

// Obfuscation ringan untuk nilai sensitif di localStorage (mis. API key Roblox).
// CATATAN: ini BUKAN enkripsi aman — hanya menyamarkan agar tidak terbaca sekilas.
// Kunci ikut ter-bundle, jadi jangan anggap rahasia mutlak.
const OBF_KEY = 'audio-studio-v2-local';

function xorText(text, key) {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    out += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}

export function obfuscate(value) {
  const str = String(value ?? '');
  if (!str) return '';
  try {
    return btoa(unescape(encodeURIComponent(xorText(str, OBF_KEY))));
  } catch {
    return '';
  }
}

export function deobfuscate(value) {
  const str = String(value ?? '');
  if (!str) return '';
  try {
    return xorText(decodeURIComponent(escape(atob(str))), OBF_KEY);
  } catch {
    return '';
  }
}

export function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// Hook state yang otomatis tersimpan ke localStorage (debounced).
export function useStoredState(key, fallback) {
  const [value, setValue] = useState(() => safeParse(localStorage.getItem(key), fallback));
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Storage bisa penuh / diblokir di mode privat — app tetap jalan.
      }
    }, 250);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [key, value]);

  return [value, setValue];
}
