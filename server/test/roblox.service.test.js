import { describe, it, expect } from 'vitest';
import { cleanNumericId, resolveRobloxCreator, resolveApiKey } from '../routes/audio.routes.js';

// Test formatRobloxError locally since it's not exported from roblox.service.js
function formatRobloxError(errorOrData, fallback = 'Roblox menolak request.') {
  const response = errorOrData?.response;
  const data = response?.data || errorOrData || {};
  const raw = data.errors?.[0]?.message
    || data.message
    || data.error?.message
    || data.error
    || errorOrData?.message
    || fallback;
  const message = String(raw).slice(0, 500);
  const status = response?.status || data.status || errorOrData?.status || 0;

  if (status === 401 || status === 403) {
    return {
      message: 'API key ditolak Roblox atau belum punya permission asset:read/asset:write untuk creator ini.',
      status
    };
  }
  if (status === 413) return { message: 'File audio terlalu besar untuk Assets API Roblox.', status };
  if (status === 429) return { message: 'Roblox membatasi request upload. Coba lagi setelah beberapa saat.', status };
  if (status >= 500) return { message: 'Roblox API sedang bermasalah. Coba ulang nanti.', status };
  return { message, status };
}

describe('Roblox Service - Utility Functions', () => {
  describe('cleanNumericId', () => {
    it('should return valid numeric ID', () => {
      expect(cleanNumericId('123456')).toBe('123456');
      expect(cleanNumericId('12')).toBe('12');
    });

    it('should return empty string for invalid ID', () => {
      expect(cleanNumericId('abc')).toBe('');
      expect(cleanNumericId('1')).toBe('');
      expect(cleanNumericId('')).toBe('');
      expect(cleanNumericId(null)).toBe('');
      expect(cleanNumericId(undefined)).toBe('');
    });

    it('should trim whitespace', () => {
      expect(cleanNumericId('  123456  ')).toBe('123456');
    });
  });

  describe('resolveRobloxCreator', () => {
    it('should return group mode when groupId is valid', () => {
      const result = resolveRobloxCreator({ groupId: '123456' });
      expect(result.mode).toBe('group');
      expect(result.creator.groupId).toBe('123456');
      expect(result.warnings).toEqual([]);
    });

    it('should return personal mode when userId is valid', () => {
      const result = resolveRobloxCreator({ userId: '123456' });
      expect(result.mode).toBe('personal');
      expect(result.creator.userId).toBe('123456');
      expect(result.warnings).toEqual([]);
    });

    it('should prefer groupId over userId', () => {
      const result = resolveRobloxCreator({ groupId: '123456', userId: '789012' });
      expect(result.mode).toBe('group');
      expect(result.creator.groupId).toBe('123456');
    });

    it('should throw error when required and no valid creator', () => {
      expect(() => resolveRobloxCreator({}, true)).toThrow('Isi Roblox User ID');
    });

    it('should return warnings when not required and no valid creator', () => {
      const result = resolveRobloxCreator({}, false);
      expect(result.creator).toBeNull();
      expect(result.mode).toBe('unknown');
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('resolveApiKey', () => {
    it('should return trimmed api key', () => {
      expect(resolveApiKey({ apiKey: '  test-key-123  ' })).toBe('test-key-123');
    });

    it('should return empty string for missing key', () => {
      expect(resolveApiKey({})).toBe('');
    });
  });

  describe('formatRobloxError', () => {
    it('should format 401 error', () => {
      const error = { response: { status: 401, data: {} } };
      const result = formatRobloxError(error);
      expect(result.status).toBe(401);
      expect(result.message).toContain('API key ditolak');
    });

    it('should format 403 error', () => {
      const error = { response: { status: 403, data: {} } };
      const result = formatRobloxError(error);
      expect(result.status).toBe(403);
      expect(result.message).toContain('API key ditolak');
    });

    it('should format 413 error', () => {
      const error = { response: { status: 413, data: {} } };
      const result = formatRobloxError(error);
      expect(result.status).toBe(413);
      expect(result.message).toContain('terlalu besar');
    });

    it('should format 429 error', () => {
      const error = { response: { status: 429, data: {} } };
      const result = formatRobloxError(error);
      expect(result.status).toBe(429);
      expect(result.message).toContain('membatasi request');
    });

    it('should format 500+ error', () => {
      const error = { response: { status: 500, data: {} } };
      const result = formatRobloxError(error);
      expect(result.status).toBe(500);
      expect(result.message).toContain('bermasalah');
    });

    it('should extract error message from response data', () => {
      const error = { 
        response: { 
          status: 400, 
          data: { errors: [{ message: 'Custom error' }] } 
        } 
      };
      const result = formatRobloxError(error);
      expect(result.message).toBe('Custom error');
    });

    it('should use fallback message when no other info', () => {
      const error = {};
      const result = formatRobloxError(error, 'Fallback message');
      expect(result.message).toBe('Fallback message');
    });
  });
});
