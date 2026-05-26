import { describe, it, expect } from 'vitest';
import { buildCollectionPagesSelectQuery } from '$lib/templates/collection/server/db';

describe('buildCollectionPagesSelectQuery', () => {
  it('builds a full SELECT with joins, filter, and reader sort order', () => {
    const sql = buildCollectionPagesSelectQuery('p.id, p.slug');

    expect(sql).toMatch(/^SELECT p\.id, p\.slug\n/);
    expect(sql).toContain('FROM collection_pages AS cp');
    expect(sql).toContain('INNER JOIN pages AS p ON p.id = cp.page_id');
    expect(sql).toContain('LEFT JOIN collection_parts AS pt ON pt.id = cp.part_id');
    expect(sql).toContain('WHERE cp.collection_id = ?');
    expect(sql).toMatch(
      /ORDER BY[\s\S]*CASE WHEN cp\.part_id IS NULL THEN 1 ELSE 0 END[\s\S]*COALESCE\(pt\.sort_order, 999999\)[\s\S]*cp\.sort_order ASC/
    );
  });

  it('normalizes whitespace in the column list', () => {
    const sql = buildCollectionPagesSelectQuery(`
      p.id,
      p.slug
    `);
    expect(sql.startsWith('SELECT p.id, p.slug\n')).toBe(true);
  });
});
