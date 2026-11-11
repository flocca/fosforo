import { describe, expect, it } from 'vitest';
import { contentDir } from '../../src/lib/content-dir';

describe('contentDir', () => {
  it('senza CONTENT_DIR punta a example-content', () => {
    expect(contentDir('/a/b', {})).toMatch(/\/example-content$/);
    expect(contentDir(undefined, {})).toMatch(/\/example-content$/);
  });

  it('risolve CONTENT_DIR rispetto alla cwd', () => {
    expect(contentDir('/a/b', { CONTENT_DIR: '../x' })).toBe('/a/x');
  });
});
