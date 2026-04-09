export interface MemoryConsolidatorProps {
  oldText: string;
  newText: string;
  category: string;
}

export interface IMemoryConsolidator {
  consolidate(props: MemoryConsolidatorProps): Promise<string>;
}

/**
 * DefaultConsolidator: Provides basic string concatenation with a safety limit.
 * Used as a zero-dependency fallback for the Core.
 */
export class DefaultConsolidator implements IMemoryConsolidator {
  constructor(private maxLen: number = 2000) {}

  async consolidate(props: MemoryConsolidatorProps): Promise<string> {
    const combined = `${props.oldText} | ${props.newText}`;
    return combined.slice(0, this.maxLen);
  }
}
