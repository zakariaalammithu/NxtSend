import type { ZodTypeAny } from "./zod";

export function zodResolver<T extends ZodTypeAny>(schema: T) {
  return async (values: unknown) => {
    const result = schema.safeParse(values);
    if (result.success) {
      return { values: result.data, errors: {} };
    }

    const errors: Record<string, { message: string; type: string }> = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] ? String(issue.path[0]) : "root";
      if (!errors[field]) {
        errors[field] = {
          message: issue.message,
          type: "validation",
        };
      }
    }

    return { values: {}, errors };
  };
}
