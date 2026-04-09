import AjvModule from "ajv";
import addFormatsModule from "ajv-formats";

const Ajv = (AjvModule as any).default || AjvModule;
const addFormats = (addFormatsModule as any).default || addFormatsModule;

/**
 * Shared, strict Ajv instance for all protocol validation.
 * Used by Fastify validator compiler and internal validation checks.
 */
export const ajv = new Ajv({
    strict: true,
    removeAdditional: false, // Force 400 when clients send extra fields
    coerceTypes: false,
    allErrors: true,
    useDefaults: true
});

addFormats(ajv);

/**
 * Standardized Error Formatting utility.
 * Normalizes validation errors from both Fastify and standalone checks.
 */
export function formatValidationError(errors: any[] | null | undefined): string {
    if (!errors || errors.length === 0) return "Unknown validation error";
    
    return errors.map(err => {
        const path = err.instancePath ? `'${err.instancePath}' ` : "";
        return `${path}${err.message}`;
    }).join("; ");
}
