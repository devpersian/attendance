import React, { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  busy?: boolean;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Self-contained confirmation dialog. Deliberately does NOT reuse Modal —
 * nested overlay + stopPropagation handlers previously swallowed clicks on
 * the confirm button ("the red حذف button does nothing").
 */
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'تأیید',
  busy = false,
  cancelText = 'انصراف',
  type = 'danger',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  // Esc to close (unless an action is in flight)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, busy, onCancel]);

  if (!isOpen) return null;

  const iconColor = type === 'danger' ? '#BB0000' : type === 'warning' ? '#C17900' : '#0A6ED1';
  const iconBg = type === 'danger' ? '#FFF5F5' : type === 'warning' ? '#FFF8E6' : '#F0F6FF';

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(50, 54, 58, 0.4)', backdropFilter: 'blur(2px)', zIndex: 100 }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* No onClick on this panel: accidental outside-clicks must not dismiss a delete flow. */}
      <div
        className="ent-modal"
        onKeyDown={(e) => { if (e.key === 'Enter' && !busy) onConfirm(); }}
      >
        <div className="ent-modal-header flex items-start gap-4">
          <div className="w-12 h-12 rounded flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
            <AlertTriangle size={24} color={iconColor} />
          </div>
          <div className="flex-1">
            <h3 className="ent-h2 mb-2">{title}</h3>
            <p className="ent-body">{message}</p>
          </div>
        </div>

        <div className="ent-modal-footer">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!busy) onConfirm(); }}
            disabled={busy}
            className={`${type === 'danger' ? 'ent-btn-danger' : 'ent-btn-primary'} px-5 ${busy ? 'opacity-60 cursor-wait' : ''}`}
          >
            {busy ? 'در حال انجام…' : confirmText}
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!busy) onCancel(); }}
            disabled={busy}
            className="ent-btn-secondary"
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
}
