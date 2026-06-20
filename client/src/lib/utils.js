// Fungsi-fungsi murni: parsing, validasi, dan merge data lokal.
import { MAX_AUDIO_DURATION_SECONDS, defaultSettings } from './constants.js';

export function clampMaxDuration(value) {
  const numeric = Number(value || MAX_AUDIO_DURATION_SECONDS);
  return Math.min(Math.max(numeric, 30), MAX_AUDIO_DURATION_SECONDS);
}

export function normalizeSettings(settings = {}) {
  return {
    ...defaultSettings,
    ...settings,
    maxDuration: clampMaxDuration(settings.maxDuration),
    maxDurationLimit: MAX_AUDIO_DURATION_SECONDS
  };
}

export function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiresAt = payload.exp * 1000;
    return Date.now() >= expiresAt;
  } catch {
    return true;
  }
}

export function cleanRobloxId(value) {
  const text = String(value || '').trim();
  return /^\d{2,32}$/.test(text) ? text : '';
}

export function apiError(data, fallback) {
  const error = new Error(data?.error || fallback);
  error.details = Array.isArray(data?.details)
    ? data.details.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5)
    : [];
  return error;
}

export function extractYoutubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (parsed.searchParams.get('v')) return parsed.searchParams.get('v');
    const m1 = parsed.pathname.match(/\/shorts\/([^/?]+)/);
    if (m1) return m1[1];
    const m2 = parsed.pathname.match(/\/embed\/([^/?]+)/);
    if (m2) return m2[1];
  } catch {
    return '';
  }
  return '';
}

export function detectSourceKind(value) {
  const trimmed = String(value || '').trim();
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be' && parsed.pathname.length > 1) return 'youtube';
    if (host.endsWith('youtube.com')
      && (parsed.searchParams.has('v') || parsed.pathname.includes('/shorts/') || parsed.pathname.includes('/embed/'))) {
      return 'youtube';
    }
    if (host === 'soundcloud.com' || host === 'm.soundcloud.com' || host === 'on.soundcloud.com' || host === 'snd.sc') {
      return 'soundcloud';
    }
  } catch {
    return '';
  }
  return '';
}

export function historyIdentity(entry) {
  const partKey = (entry.parts || []).map((part) => part.rbxassetid || part.assetId || part.operationId).filter(Boolean).join('|');
  return entry.id || partKey || `${entry.createdAt || ''}|${entry.youtubeUrl || ''}|${entry.title || ''}`;
}

export function compactGroups(items) {
  return (Array.isArray(items) ? items : []).slice(0, 30).map((group) => ({
    id: group.id,
    name: group.name,
    groupId: group.groupId,
    creatorUserId: group.creatorUserId,
    hasApiKey: Boolean(group.hasApiKey || group.encryptedApiKey),
    apiKeyFormat: group.apiKeyFormat || (group.encryptedApiKey ? 'legacy' : 'empty')
  }));
}

export function compactHistory(items) {
  return (Array.isArray(items) ? items : []).slice(0, 75).map((entry) => ({
    id: entry.id,
    createdAt: entry.createdAt,
    title: entry.title,
    thumbnail: entry.thumbnail,
    youtubeUrl: entry.youtubeUrl,
    settings: entry.settings,
    speedNormal: entry.speedNormal,
    uploadSummary: entry.uploadSummary || null,
    conversion: entry.conversion || null,
    parts: (entry.parts || []).slice(0, 30).map((part) => ({
      part: part.part,
      status: part.status,
      assetId: part.assetId,
      rbxassetid: part.rbxassetid,
      operationId: part.operationId,
      error: part.error,
      trace: (part.trace || []).slice(0, 12)
    })),
    expired: Boolean(entry.expired)
  }));
}

export function mergeHistory(primary = [], secondary = []) {
  const seen = new Set();
  const merged = [];
  for (const entry of [...compactHistory(primary), ...compactHistory(secondary)]) {
    const key = historyIdentity(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  merged.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return compactHistory(merged);
}

export function mergeGroups(primary = [], secondary = []) {
  const byKey = new Map();
  for (const group of [...compactGroups(secondary), ...compactGroups(primary)]) {
    const key = group.groupId || group.id;
    if (!key) continue;
    const previous = byKey.get(key) || {};
    byKey.set(key, {
      ...previous,
      ...group,
      hasApiKey: Boolean(previous.hasApiKey || group.hasApiKey),
      apiKeyFormat: group.apiKeyFormat || previous.apiKeyFormat || (group.hasApiKey || previous.hasApiKey ? 'aes-256-gcm' : 'empty')
    });
  }
  return compactGroups([...byKey.values()]);
}
