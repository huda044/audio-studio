import { describe, it, expect } from 'vitest';
import { makeZip } from '../lib/zip.js';

describe('makeZip', () => {
  it('should create a zip Blob', () => {
    const files = [
      { name: 'test.txt', data: new Uint8Array([65, 66, 67]) }
    ];
    const result = makeZip(files);
    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('application/zip');
  });

  it('should handle multiple files', () => {
    const files = [
      { name: 'a.txt', data: new Uint8Array([1]) },
      { name: 'b.txt', data: new Uint8Array([2]) }
    ];
    const result = makeZip(files);
    expect(result.size).toBeGreaterThan(50);
  });

  it('should handle empty file list gracefully', () => {
    const result = makeZip([]);
    expect(result).toBeInstanceOf(Blob);
  });
});
