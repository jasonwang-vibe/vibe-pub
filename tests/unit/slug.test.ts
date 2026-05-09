import { describe, it, expect } from 'vitest';
import {
  generatePageId,
  isValidSlug,
  extractIdFromUrlSegment,
  slugifyTitle,
  buildCanonicalPath,
} from '$lib/server/slug';

describe('generatePageId', () => {
  it('returns 8 base62 characters', () => {
    const id = generatePageId();
    expect(id).toMatch(/^[A-Za-z0-9]{8}$/);
  });

  it('produces unique ids over many draws', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generatePageId()));
    expect(ids.size).toBe(1000);
  });
});

describe('extractIdFromUrlSegment', () => {
  it('returns the segment when no hyphen present', () => {
    expect(extractIdFromUrlSegment('aB3cD9xZ')).toBe('aB3cD9xZ');
  });

  it('returns the trailing token when hyphens are present', () => {
    expect(extractIdFromUrlSegment('foo-bar-aB3cD9xZ')).toBe('aB3cD9xZ');
  });

  it('handles single trailing hyphen edge cases', () => {
    expect(extractIdFromUrlSegment('foo-')).toBe('');
    expect(extractIdFromUrlSegment('-aB3cD9xZ')).toBe('aB3cD9xZ');
  });
});

describe('slugifyTitle', () => {
  it('lowercases and dashes', () => {
    expect(slugifyTitle('My Page!')).toBe('my-page');
    expect(slugifyTitle('Hello, World 2024')).toBe('hello-world-2024');
  });

  it('returns empty string for null/undefined/whitespace/punct-only', () => {
    expect(slugifyTitle(null)).toBe('');
    expect(slugifyTitle(undefined)).toBe('');
    expect(slugifyTitle('   ')).toBe('');
    expect(slugifyTitle('!!!')).toBe('');
  });

  it('caps length to 60 chars and trims trailing dashes', () => {
    const long = slugifyTitle('a'.repeat(120));
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith('-')).toBe(false);
  });
});

describe('buildCanonicalPath', () => {
  it('uses stored slug when set', () => {
    expect(buildCanonicalPath({ id: 'aB3cD9xZ', slug: 'my-cool', title: null })).toBe(
      '/my-cool-aB3cD9xZ'
    );
  });

  it('derives from title when slug is empty', () => {
    expect(buildCanonicalPath({ id: 'aB3cD9xZ', slug: '', title: 'My Page' })).toBe(
      '/my-page-aB3cD9xZ'
    );
  });

  it('returns bare /id when neither slug nor title yields a part', () => {
    expect(buildCanonicalPath({ id: 'aB3cD9xZ', slug: '', title: null })).toBe('/aB3cD9xZ');
    expect(buildCanonicalPath({ id: 'aB3cD9xZ', slug: '', title: '!!!' })).toBe('/aB3cD9xZ');
  });
});

describe('isValidSlug', () => {
  it('accepts valid slugs', () => {
    expect(isValidSlug('my-report')).toBe(true);
    expect(isValidSlug('abc123')).toBe(true);
    expect(isValidSlug('hello-world-2024')).toBe(true);
  });

  it('rejects invalid slugs', () => {
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('has spaces')).toBe(false);
    expect(isValidSlug('UPPERCASE')).toBe(false);
    expect(isValidSlug('../traversal')).toBe(false);
    expect(isValidSlug('a'.repeat(101))).toBe(false);
  });
});
