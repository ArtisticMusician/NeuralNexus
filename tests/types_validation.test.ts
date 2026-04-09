import { describe, it, expect } from 'vitest';
import { type MemoryCategory } from '../src/core/types.js';

describe('Core Types Validation', () => {
  it('should allow valid memory categories', () => {
    const categories: MemoryCategory[] = ["preference", "fact", "decision", "entity", "other"];
    expect(categories).toContain("preference");
    expect(categories).toContain("fact");
  });
});
