export class DecayEngine {
    /**
     * Applies exponential decay with category-specific lambda and strength.
     * If lambda === 0, no decay is applied.
     *
     * lastAccessed represents the *previous* access time, not the current one.
     * The caller should update lastAccessed to now *after* scoring.
     */
    calculateScore(
        originalScore: number,
        lastAccessed: number,
        lambda: number,
        strength = 1,
        timeUnit: "ms" | "seconds" | "minutes" | "hours" | "days" = "ms",
        createdAt?: number
    ): number {
        if (lambda === 0) {
            return originalScore * strength;
        }

        const now = Date.now();

        if (!lastAccessed || lastAccessed <= 0) {
            console.warn("Memory missing last_accessed_at — this indicates a write-path bug.");
            if (createdAt && createdAt > 0) {
                lastAccessed = createdAt;
            } else {
                lastAccessed = now;
            }
        }

        let delta = now - lastAccessed;

        switch (timeUnit) {
            case "seconds": delta /= 1000; break;
            case "minutes": delta /= 60000; break;
            case "hours": delta /= 3600000; break;
            case "days": delta /= 86400000; break;
            case "ms":
            default: break;
        }

        return (originalScore * strength) * Math.exp(-lambda * delta);
    }
}