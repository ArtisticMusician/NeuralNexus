import axios from "axios";
import { IMemoryConsolidator, MemoryConsolidatorProps } from "../core/MemoryConsolidator.js";

export class LLMConsolidator implements IMemoryConsolidator {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string = "gpt-3.5-turbo"
  ) {}

  async consolidate(props: MemoryConsolidatorProps): Promise<string> {
      const prompt = `You are a memory consolidation engine. Merge the following two related records into one concise, accurate fact. 
If information in the NEW record contradicts the OLD record, the NEW record is the current truth. 
Preserve all unique identifiers like names, professions, locations, and dates. 
Output ONLY the resulting merged text.

CATEGORY: ${props.category}
OLD RECORD: ${props.oldText}
NEW RECORD: ${props.newText}

Merged Result:`;

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            { role: "system", content: "You are a concise memory consolidation expert." },
            { role: "user", content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 500
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
          }
        }
      );

      const result = response.data.choices?.[0]?.message?.content?.trim();

      if (!result) {
        throw new Error("Empty response from LLM");
      }

      return result;
    } catch (err) {
      console.error("[LLMConsolidator] Consolidation failed:", err);
      // Fallback to simple concatenation if LLM fails
      return `${props.oldText} | ${props.newText}`.slice(0, 2000);
    }
  }
}
