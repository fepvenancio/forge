import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, basename } from "node:path";

const SCHEMAS_DIR = resolve(import.meta.dirname, "../../../../packages/schemas");

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  schemaPath: string;
}

// Schema types that can be validated
export type SchemaType =
  | "plan"
  | "touch-map"
  | "sub-judge-report"
  | "property-test-report"
  | "security-report"
  | "high-court-report"
  | "cycle-cost-report";

let ajvInstance: Ajv | null = null;

function getAjv(): Ajv {
  if (!ajvInstance) {
    ajvInstance = new Ajv({ allErrors: true, strict: false });
    addFormats(ajvInstance);

    // Load all schemas from the schemas directory
    const files = readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith(".schema.json"));
    for (const file of files) {
      const schemaPath = resolve(SCHEMAS_DIR, file);
      const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
      const schemaName = basename(file, ".schema.json");
      ajvInstance.addSchema(schema, schemaName);
    }
  }
  return ajvInstance;
}

function formatErrors(errors: ErrorObject[] | null | undefined): ValidationError[] {
  if (!errors) return [];

  return errors.map((err) => ({
    field: err.instancePath || "/",
    message: err.message || "Unknown validation error",
    schemaPath: err.schemaPath,
  }));
}

/**
 * Validate a JSON object against a named schema.
 * Returns a typed result with field-level error messages.
 */
export function validate(schemaType: SchemaType, data: unknown): ValidationResult {
  const ajv = getAjv();
  const validateFn = ajv.getSchema(schemaType);

  if (!validateFn) {
    return {
      valid: false,
      errors: [
        {
          field: "/",
          message: `Schema "${schemaType}" not found. Available schemas: ${getAvailableSchemas().join(", ")}`,
          schemaPath: "",
        },
      ],
    };
  }

  const valid = validateFn(data) as boolean;

  if (valid) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: formatErrors(validateFn.errors),
  };
}

/**
 * Validate and throw if invalid. Returns the data typed if valid.
 */
export function validateOrThrow<T>(schemaType: SchemaType, data: unknown): T {
  const result = validate(schemaType, data);
  if (!result.valid) {
    const errorSummary = result.errors
      .map((e) => `  ${e.field}: ${e.message}`)
      .join("\n");
    throw new Error(
      `Schema validation failed for "${schemaType}":\n${errorSummary}`,
    );
  }
  return data as T;
}

/**
 * Get list of available schema names.
 */
export function getAvailableSchemas(): string[] {
  try {
    return readdirSync(SCHEMAS_DIR)
      .filter((f) => f.endsWith(".schema.json"))
      .map((f) => basename(f, ".schema.json"));
  } catch {
    return [];
  }
}

/**
 * Format validation errors as a human-readable string for feeding back to agents.
 */
export function formatValidationFeedback(
  schemaType: SchemaType,
  errors: ValidationError[],
): string {
  const lines = [
    `Your previous ${schemaType} output failed validation with these errors:`,
    "",
    ...errors.map((e) => `- Field "${e.field}": ${e.message}`),
    "",
    "Correct it and try again.",
  ];
  return lines.join("\n");
}
