import React from 'react';
import { Loader2, Inbox } from 'lucide-react';

/**
 * Shared presentational primitives used across the feature components.
 * Extracted to remove duplicated modal/spinner/empty-state markup.
 */

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Extra classes for the dialog body (e.g. max-width overrides). */
  className?: string;
}

/** Accessible-ish modal overlay with a header (title + close) and body. */
export function Modal({ isOpen, onClose, title, children, className = '' }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 ent-modal-overlay flex items-center justify-center z-[60] p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`ent-modal ${className}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ent-modal-header flex items-center justify-between">
          <h3 className="ent-h2">{title}</h3>
          <button
            onClick={onClose}
            aria-label="بستن"
            className="text-[#8A8E93] hover:text-[#32363A] transition-colors p-1 hover:bg-[#F7F8FA] rounded"
          >
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

interface LoadingStateProps {
  label?: string;
  className?: string;
}

export function LoadingState({ label = 'در حال بارگذاری...', className = '' }: LoadingStateProps) {
  return (
    <div className={`flex items-center justify-center gap-2 py-12 ${className}`}>
      <Loader2 size={20} className="animate-spin text-[#0A6ED1]" />
      <span className="ent-body text-[#8A8E93]">{label}</span>
    </div>
  );
}

interface EmptyStateProps {
  message: string;
  hint?: string;
  icon?: React.ReactNode;
}

export function EmptyState({ message, hint, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <span className="text-[#8A8E93]">{icon ?? <Inbox size={28} />}</span>
      <p className="ent-body">{message}</p>
      {hint && <p className="ent-caption text-[#8A8E93]">{hint}</p>}
    </div>
  );
}
