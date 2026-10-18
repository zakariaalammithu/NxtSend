/**
 * Self-contained Zod compatibility module for NxtSend.
 * Provides schema definition, inference, and validation mirroring the Zod API.
 */

export interface ZodIssue {
  code?: string;
  path: (string | number)[];
  message: string;
}

export class ZodError extends Error {
  issues: ZodIssue[];

  constructor(issues: ZodIssue[]) {
    super(issues.map((i) => i.message).join(", "));
    this.name = "ZodError";
    this.issues = issues;
  }

  get errors(): ZodIssue[] {
    return this.issues;
  }

  flatten(): { formErrors: string[]; fieldErrors: Record<string, string[]> } {
    const fieldErrors: Record<string, string[]> = {};
    const formErrors: string[] = [];

    for (const issue of this.issues) {
      if (issue.path.length > 0) {
        const key = String(issue.path[0]);
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      } else {
        formErrors.push(issue.message);
      }
    }

    return { formErrors, fieldErrors };
  }
}

export type SafeParseReturnType<Output> =
  | { success: true; data: Output }
  | { success: false; error: ZodError };

// Like zod's own ZodTypeAny: the phantom _output/_input members make
// ZodType invariant in its type parameters, so a permissive alias is
// required wherever a schema of any shape must be accepted.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ZodTypeAny = ZodType<any, any>;

export abstract class ZodType<Output = unknown, Input = Output> {
  _output!: Output;
  _input!: Input;

  abstract safeParse(data: unknown, path?: (string | number)[]): SafeParseReturnType<Output>;

  parse(data: unknown): Output {
    const result = this.safeParse(data);
    if (!result.success) {
      throw result.error;
    }
    return result.data;
  }

  refine(
    check: (data: Output) => boolean | Promise<boolean>,
    messageOrOptions?: string | { message?: string; path?: (string | number)[] }
  ): ZodEffects<Output, Input> {
    const message =
      typeof messageOrOptions === "string"
        ? messageOrOptions
        : messageOrOptions?.message ?? "Invalid value";
    const path = typeof messageOrOptions === "object" ? messageOrOptions.path : undefined;

    return new ZodEffects(this, check, message, path);
  }

  optional(): ZodOptional<this> {
    return new ZodOptional(this);
  }
}

export class ZodString extends ZodType<string> {
  private minLength?: { val: number; message?: string };
  private maxLength?: { val: number; message?: string };
  private isEmail = false;
  private emailMessage?: string;

  min(length: number, message?: string): this {
    this.minLength = { val: length, message };
    return this;
  }

  max(length: number, message?: string): this {
    this.maxLength = { val: length, message };
    return this;
  }

  email(message?: string): this {
    this.isEmail = true;
    this.emailMessage = message;
    return this;
  }

  safeParse(data: unknown, path: (string | number)[] = []): SafeParseReturnType<string> {
    if (typeof data !== "string") {
      return {
        success: false,
        error: new ZodError([
          { path, message: "Expected string, received " + typeof data },
        ]),
      };
    }

    if (this.minLength && data.length < this.minLength.val) {
      return {
        success: false,
        error: new ZodError([
          {
            path,
            message:
              this.minLength.message ||
              `String must contain at least ${this.minLength.val} character(s)`,
          },
        ]),
      };
    }

    if (this.maxLength && data.length > this.maxLength.val) {
      return {
        success: false,
        error: new ZodError([
          {
            path,
            message:
              this.maxLength.message ||
              `String must contain at most ${this.maxLength.val} character(s)`,
          },
        ]),
      };
    }

    if (this.isEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.trim())) {
        return {
          success: false,
          error: new ZodError([
            { path, message: this.emailMessage || "Invalid email address" },
          ]),
        };
      }
    }

    return { success: true, data };
  }
}

export class ZodBoolean extends ZodType<boolean> {
  safeParse(data: unknown, path: (string | number)[] = []): SafeParseReturnType<boolean> {
    if (typeof data !== "boolean") {
      return {
        success: false,
        error: new ZodError([
          { path, message: "Expected boolean, received " + typeof data },
        ]),
      };
    }
    return { success: true, data };
  }
}

export class ZodNumber extends ZodType<number> {
  safeParse(data: unknown, path: (string | number)[] = []): SafeParseReturnType<number> {
    if (typeof data !== "number" || isNaN(data)) {
      return {
        success: false,
        error: new ZodError([
          { path, message: "Expected number, received " + typeof data },
        ]),
      };
    }
    return { success: true, data };
  }
}

export class ZodOptional<T extends ZodTypeAny> extends ZodType<
  T["_output"] | undefined
> {
  constructor(private inner: T) {
    super();
  }

  safeParse(
    data: unknown,
    path: (string | number)[] = []
  ): SafeParseReturnType<T["_output"] | undefined> {
    if (data === undefined || data === null || data === "") {
      return { success: true, data: undefined };
    }
    return this.inner.safeParse(data, path);
  }
}

export class ZodEffects<T, I = T> extends ZodType<T> {
  constructor(
    private inner: ZodType<T, I>,
    private check: (data: T) => boolean | Promise<boolean>,
    private message: string,
    private customPath?: (string | number)[]
  ) {
    super();
  }

  safeParse(data: unknown, path: (string | number)[] = []): SafeParseReturnType<T> {
    const innerResult = this.inner.safeParse(data, path);
    if (!innerResult.success) {
      return innerResult;
    }

    const passed = this.check(innerResult.data);
    if (!passed) {
      return {
        success: false,
        error: new ZodError([
          {
            path: this.customPath ? [...path, ...this.customPath] : path,
            message: this.message,
          },
        ]),
      };
    }

    return { success: true, data: innerResult.data };
  }
}

export type ZodRawShape = Record<string, ZodTypeAny>;

export class ZodObject<T extends ZodRawShape> extends ZodType<{
  [K in keyof T]: T[K]["_output"];
}> {
  constructor(public shape: T) {
    super();
  }

  safeParse(
    data: unknown,
    path: (string | number)[] = []
  ): SafeParseReturnType<{ [K in keyof T]: T[K]["_output"] }> {
    if (typeof data !== "object" || data === null) {
      return {
        success: false,
        error: new ZodError([
          { path, message: "Expected object, received " + typeof data },
        ]),
      };
    }

    const issues: ZodIssue[] = [];
    const result: Record<string, unknown> = {};
    const record = data as Record<string, unknown>;

    for (const key of Object.keys(this.shape)) {
      const fieldSchema = this.shape[key];
      const fieldValue = record[key];
      const fieldResult = fieldSchema.safeParse(fieldValue, [...path, key]);

      if (!fieldResult.success) {
        issues.push(...fieldResult.error.issues);
      } else {
        result[key] = fieldResult.data;
      }
    }

    if (issues.length > 0) {
      return { success: false, error: new ZodError(issues) };
    }

    return { success: true, data: result as { [K in keyof T]: T[K]["_output"] } };
  }
}

export class ZodEnum<U extends string> extends ZodType<U> {
  constructor(private values: U[]) {
    super();
  }

  safeParse(data: unknown, path: (string | number)[] = []): SafeParseReturnType<U> {
    if (typeof data !== "string" || !this.values.includes(data as U)) {
      return {
        success: false,
        error: new ZodError([
          {
            path,
            message: `Expected one of [${this.values.join(", ")}], received ${data}`,
          },
        ]),
      };
    }
    return { success: true, data: data as U };
  }
}

export const z = {
  string: () => new ZodString(),
  boolean: () => new ZodBoolean(),
  number: () => new ZodNumber(),
  object: <T extends ZodRawShape>(shape: T) => new ZodObject(shape),
  enum: <U extends string>(values: U[]) => new ZodEnum(values),
};

// The namespace mirrors zod's public API shape so callers can write
// z.infer<typeof schema> in type positions, as with the real package.
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace z {
  export type infer<T extends ZodTypeAny> = T["_output"];
}

export type infer<T extends ZodTypeAny> = T["_output"];
