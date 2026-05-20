'use client';

import React, { useState, useCallback } from 'react';

/* ===== Reusable Form Field with inline validation ===== */
interface FormFieldProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  error?: string;
}

export function FormField({ label, required, children, className = '', error }: FormFieldProps) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1 animate-fadeIn">
          <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
          {error}
        </p>
      )}
    </div>
  );
}

/* ===== Reusable Input with error state ===== */
interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export function FormInput({ className = '', error, ...props }: FormInputProps) {
  return (
    <input
      className={`w-full bg-[var(--af-bg3)] border rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none transition-colors ${error ? 'border-red-500 focus:border-red-500' : 'border-[var(--input)] focus:border-[var(--af-accent)]'} ${className}`}
      {...props}
    />
  );
}

/* ===== Reusable Select with error state ===== */
interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode;
  error?: string;
}

export function FormSelect({ className = '', children, error, ...props }: FormSelectProps) {
  return (
    <select
      className={`w-full bg-[var(--af-bg3)] border rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none transition-colors ${error ? 'border-red-500 focus:border-red-500' : 'border-[var(--input)]'} ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

/* ===== Reusable Textarea with error state ===== */
interface FormTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export function FormTextarea({ className = '', error, ...props }: FormTextareaProps) {
  return (
    <textarea
      className={`w-full bg-[var(--af-bg3)] border rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none transition-colors resize-none ${error ? 'border-red-500 focus:border-red-500' : 'border-[var(--input)] focus:border-[var(--af-accent)]'} ${className}`}
      {...props}
    />
  );
}

/* ===== Reusable Modal Footer ===== */
interface ModalFooterProps {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  cancelLabel?: string;
  submitDisabled?: boolean;
  submitColor?: string;
}

export function ModalFooter({ onCancel, onSubmit, submitLabel, cancelLabel = 'Cancelar', submitDisabled, submitColor = 'bg-[var(--af-accent)] text-background border-none hover:bg-[var(--af-accent2)]' }: ModalFooterProps) {
  return (
    <div className="flex gap-2 justify-end mt-5 pt-4 border-t border-[var(--border)]">
      <button
        className="px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer bg-transparent text-[var(--muted-foreground)] border border-[var(--input)] hover:bg-[var(--af-bg3)] hover:text-[var(--foreground)] transition-all"
        onClick={onCancel}
      >
        {cancelLabel}
      </button>
      <button
        className={`px-4 py-2 rounded-lg text-[13px] font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${submitColor}`}
        onClick={onSubmit}
        disabled={submitDisabled}
      >
        {submitLabel}
      </button>
    </div>
  );
}

/* ===== Validation helper hook ===== */
export function useFormValidation() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setError = useCallback((field: string, message: string) => {
    setErrors(prev => ({ ...prev, [field]: message }));
  }, []);

  const clearError = useCallback((field: string) => {
    setErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setErrors({});
  }, []);

  const hasErrors = Object.keys(errors).length > 0;

  const validateRequired = useCallback((field: string, value: string, label: string) => {
    if (!value.trim()) {
      setError(field, `${label} es obligatorio`);
      return false;
    }
    clearError(field);
    return true;
  }, [setError, clearError]);

  const onBlurRequired = useCallback((field: string, value: string, label: string) => {
    return validateRequired(field, value, label);
  }, [validateRequired]);

  return { errors, setError, clearError, clearAll, hasErrors, validateRequired, onBlurRequired };
}
