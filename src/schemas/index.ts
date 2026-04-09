import * as APISchemas from "./v1/api.js";
import * as InternalSchemas from "./v1/internal.js";
import * as OpenAISchemas from "./v1/openai.js";
import { ajv, formatValidationError } from "./ajv.js";

export const Schemas = {
    V1: {
        API: APISchemas,
        Internal: InternalSchemas,
        OpenAI: OpenAISchemas
    }
};

export { ajv, formatValidationError };
