"use client";

import * as React from "react";

export type FieldValues = Record<string, unknown>;

export interface FieldError {
  type?: string;
  message?: string;
}

export type FieldErrors<TFieldValues extends FieldValues = FieldValues> = {
  [K in keyof TFieldValues]?: FieldError;
} & {
  root?: FieldError;
};

export interface UseFormProps<TFieldValues extends FieldValues = FieldValues> {
  mode?: "onSubmit" | "onChange" | "onBlur" | "all";
  defaultValues?: Partial<TFieldValues>;
  resolver?: (values: TFieldValues) => Promise<{
    values: Partial<TFieldValues>;
    errors: FieldErrors<TFieldValues>;
  }>;
}

export type RegisterOptions = Record<string, unknown>;

export interface UseFormRegisterReturn {
  name: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  ref: (instance: HTMLElement | null) => void;
}

export interface UseFormReturn<TFieldValues extends FieldValues = FieldValues> {
  register: (name: keyof TFieldValues | string, options?: RegisterOptions) => UseFormRegisterReturn;
  handleSubmit: (
    onValid: (data: TFieldValues) => Promise<void> | void,
    onInvalid?: (errors: FieldErrors<TFieldValues>) => Promise<void> | void
  ) => (e?: React.BaseSyntheticEvent) => Promise<void>;
  watch: {
    (): TFieldValues;
    <TFieldName extends keyof TFieldValues>(name: TFieldName): TFieldValues[TFieldName];
  };
  setValue: <TFieldName extends keyof TFieldValues>(
    name: TFieldName,
    value: TFieldValues[TFieldName],
    options?: { shouldValidate?: boolean }
  ) => void;
  reset: (values?: Partial<TFieldValues>) => void;
  setError: (name: keyof TFieldValues | string, error: { message: string; type?: string }) => void;
  clearErrors: (name?: keyof TFieldValues | string) => void;
  getValues: {
    (): TFieldValues;
    <TFieldName extends keyof TFieldValues>(name: TFieldName): TFieldValues[TFieldName];
  };
  formState: {
    errors: FieldErrors<TFieldValues>;
    isSubmitting: boolean;
    isValid: boolean;
    isDirty: boolean;
  };
}

export function useForm<TFieldValues extends FieldValues = FieldValues>(
  props?: UseFormProps<TFieldValues>
): UseFormReturn<TFieldValues> {
  const [values, setValues] = React.useState<Record<string, unknown>>(() => ({
    ...(props?.defaultValues || {}),
  }));
  const [errors, setErrors] = React.useState<FieldErrors<TFieldValues>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDirty, setIsDirty] = React.useState(false);

  const valuesRef = React.useRef(values);
  valuesRef.current = values;

  const setValue = React.useCallback(
    (
      name: keyof TFieldValues,
      value: TFieldValues[keyof TFieldValues],
      options?: { shouldValidate?: boolean }
    ) => {
      setValues((prev) => {
        const next = { ...prev, [String(name)]: value };
        return next;
      });
      setIsDirty(true);
      if (options?.shouldValidate && props?.resolver) {
        props.resolver({ ...valuesRef.current, [String(name)]: value } as TFieldValues).then((res) => {
          setErrors(res.errors || {});
        });
      }
    },
    [props]
  );

  const register = React.useCallback(
    (name: keyof TFieldValues | string): UseFormRegisterReturn => {
      const fieldName = String(name);
      return {
        name: fieldName,
        onChange: (e) => {
          const target = e.target;
          const val =
            target.type === "checkbox"
              ? (target as HTMLInputElement).checked
              : target.value;
          setValue(
            fieldName as keyof TFieldValues,
            val as TFieldValues[keyof TFieldValues]
          );
        },
        onBlur: () => {
          if (props?.resolver) {
            props.resolver(valuesRef.current as TFieldValues).then((res) => {
              setErrors(res.errors || {});
            });
          }
        },
        ref: () => {},
      };
    },
    [setValue, props]
  );

  const watch = React.useCallback(
    (name?: keyof TFieldValues | string) => {
      if (!name) return values as TFieldValues;
      return values[String(name)] as TFieldValues[keyof TFieldValues];
    },
    [values]
  );

  const getValues = React.useCallback(
    (name?: keyof TFieldValues | string) => {
      if (!name) return valuesRef.current as TFieldValues;
      return valuesRef.current[String(name)] as TFieldValues[keyof TFieldValues];
    },
    []
  );

  const reset = React.useCallback(
    (newValues?: Partial<TFieldValues>) => {
      setValues({ ...(newValues || props?.defaultValues || {}) });
      setErrors({});
      setIsDirty(false);
    },
    [props?.defaultValues]
  );

  const setError = React.useCallback(
    (name: keyof TFieldValues | string, error: { message: string; type?: string }) => {
      setErrors((prev) => ({
        ...prev,
        [String(name)]: error,
      }));
    },
    []
  );

  const clearErrors = React.useCallback((name?: keyof TFieldValues | string) => {
    if (!name) {
      setErrors({});
    } else {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name as keyof TFieldValues];
        return next;
      });
    }
  }, []);

  const handleSubmit = React.useCallback(
    (
      onValid: (data: TFieldValues) => Promise<void> | void,
      onInvalid?: (errors: FieldErrors<TFieldValues>) => Promise<void> | void
    ) => {
      return async (e?: React.BaseSyntheticEvent) => {
        if (e && typeof e.preventDefault === "function") {
          e.preventDefault();
        }

        setIsSubmitting(true);
        try {
          const currentData = valuesRef.current as TFieldValues;
          if (props?.resolver) {
            const result = await props.resolver(currentData);
            if (result.errors && Object.keys(result.errors).length > 0) {
              setErrors(result.errors);
              if (onInvalid) {
                await onInvalid(result.errors);
              }
              return;
            }
            setErrors({});
            await onValid((result.values as TFieldValues) || currentData);
          } else {
            await onValid(currentData);
          }
        } finally {
          setIsSubmitting(false);
        }
      };
    },
    [props]
  );

  const isValid = Object.keys(errors).length === 0;

  return {
    register,
    handleSubmit,
    watch: watch as UseFormReturn<TFieldValues>["watch"],
    setValue,
    reset,
    setError,
    clearErrors,
    getValues: getValues as UseFormReturn<TFieldValues>["getValues"],
    formState: {
      errors,
      isSubmitting,
      isValid,
      isDirty,
    },
  };
}
