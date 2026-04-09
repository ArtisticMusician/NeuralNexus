import { type MemoryCategory } from "./types.js";

export class CategoryService {
    /**
     * Detects the category of a memory based on keyword patterns.
     * Uses negation-aware regex logic to avoid false positives.
     */
    public detectCategory(text: string): MemoryCategory {
        const lower = text.toLowerCase();

        const negationPattern =
            /(?:don't|do not|doesn't|does not|didn't|did not|won't|will not|wouldn't|would not|shouldn't|should not|can't|cannot|not|never|no longer|hardly|barely|isn't|is not|aren't|are not|wasn't|were not)\b/;

        const appearsAffirmatively = (keyword: string): boolean => {
            const keywordRegex = new RegExp(`\\b${keyword}\\b`, "gi");
            let match: RegExpExecArray | null;

            while ((match = keywordRegex.exec(lower)) !== null) {
                const windowStart = Math.max(0, match.index - 40);
                const precedingWindow = lower.slice(windowStart, match.index);

                if (!negationPattern.test(precedingWindow)) {
                    return true;
                }
            }

            return false;
        };

        const preferenceKeywords = [
            "prefer", "like", "dislike", "favorite", "favourite",
            "hate", "love", "always", "never",
        ];
        if (preferenceKeywords.some(appearsAffirmatively)) {
            return "preference";
        }

        const decisionKeywords = [
            "decided", "chose", "instead of", "plan to",
            "will use", "using", "going to use", "switched to", "opted for",
        ];
        if (decisionKeywords.some(appearsAffirmatively)) {
            return "decision";
        }

        const entityKeywords = [
            "is a", "called", "known as", "work for",
            "works for", "lives in", "located in", "founded by",
        ];
        if (entityKeywords.some(appearsAffirmatively)) {
            return "entity";
        }

        return "fact";
    }
}
