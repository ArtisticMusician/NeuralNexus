import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DecayEngine } from '../src/core/DecayEngine.js';

describe('DecayEngine', () => {
  let decayEngine: DecayEngine;

  beforeEach(() => {
    decayEngine = new DecayEngine();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns original score * strength when lambda is 0', () => {
    const score = 0.8;
    const strength = 1.2;
    const result = decayEngine.calculateScore(score, Date.now() - 1000, 0, strength);
    expect(result).toBeCloseTo(score * strength);
  });

  it('applies exponential decay when lambda > 0', () => {
    const score = 1.0;
    const oneDayMs = 24 * 60 * 60 * 1000;
    const lastAccessed = Date.now() - oneDayMs; // 1 day ago
    const lambda = 0.5;
    const strength = 1.0;

    const result = decayEngine.calculateScore(score, lastAccessed, lambda, strength, 'days');
    expect(result).toBeCloseTo(score * strength * Math.exp(-lambda * 1));
  });

  it('uses default strength of 1 if not provided', () => {
    const score = 0.9;
    const lastAccessed = Date.now();
    const result = decayEngine.calculateScore(score, lastAccessed, 0);
    expect(result).toBe(0.9);
  });

  it('decays more over longer time', () => {
    const score = 1.0;
    const lambda = 0.1;
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    // Test with 1 day vs 2 days
    const score1 = decayEngine.calculateScore(score, now - oneDay, lambda, 1, 'days');
    const score2 = decayEngine.calculateScore(score, now - (oneDay * 2), lambda, 1, 'days');

    expect(score1).toBeGreaterThan(score2);
  });
});
