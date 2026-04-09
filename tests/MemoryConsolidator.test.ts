import { describe, it, expect, vi } from 'vitest';
import { DefaultConsolidator } from '../src/core/MemoryConsolidator.js';
import { LLMConsolidator } from '../src/services/LLMConsolidator.js';
import axios from 'axios';

vi.mock('axios');
const mockedAxios = axios as any;

describe('DefaultConsolidator', () => {
  it('concatenates strings with a separator', async () => {
    const consolidator = new DefaultConsolidator(2000);
    const result = await consolidator.consolidate({
      oldText: 'Apple',
      newText: 'Orange',
      category: 'fact'
    });
    expect(result).toBe('Apple | Orange');
  });

  it('truncates if result exceeds maxLen', async () => {
    const consolidator = new DefaultConsolidator(10);
    const result = await consolidator.consolidate({
      oldText: 'LongerThan',
      newText: 'TenCharacters',
      category: 'fact'
    });
    expect(result.length).toBe(10);
    expect(result).toBe('LongerThan');
  });
});

describe('LLMConsolidator', () => {
  const baseUrl = 'https://api.example.com';
  const apiKey = 'test-key';
  const consolidator = new LLMConsolidator(baseUrl, apiKey);

  it('returns consolidated text from LLM', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        choices: [{ message: { content: 'Consolidated Fact' } }]
      }
    });

    const result = await consolidator.consolidate({
      oldText: 'Old',
      newText: 'New',
      category: 'fact'
    });

    expect(result).toBe('Consolidated Fact');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining(baseUrl),
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user' })
        ])
      }),
      expect.anything()
    );
  });

  it('falls back to concatenation if API fails', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('API Down'));

    const result = await consolidator.consolidate({
      oldText: 'Old',
      newText: 'New',
      category: 'fact'
    });

    expect(result).toBe('Old | New');
  });
});
