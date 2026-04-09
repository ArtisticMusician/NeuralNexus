type Labels = Record<string, string | number | boolean | null | undefined>;

class NoopCounter {
  add(_value: number, _labels?: Labels) {}
}

class NoopHistogram {
  record(_value: number, _labels?: Labels) {}
}

export const memoryStoredCounter = new NoopCounter();
export const recallDurationHistogram = new NoopHistogram();
export const recallCountCounter = new NoopCounter();

// In-memory session stats — readable by the health endpoint
export const sessionStats = {
  storesTotal: 0,
  recallsTotal: 0,
  totalRecallMs: 0,
  fastestRecallMs: Infinity,
  slowestRecallMs: 0,
};
