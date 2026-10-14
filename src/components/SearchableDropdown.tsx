import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ChevronDown } from 'lucide-react';

interface SearchableDropdownProps {
  options: Array<{ value: string; label: string; sublabel?: string }>;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: React.ReactNode;
  error?: string;
  disabled?: boolean;
}

export default function SearchableDropdown({
  options,
  value,
  onChange,
  placeholder = 'جستجو...',
  label,
  error,
  disabled = false
}: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Calculate dropdown position
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      });
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }

    if (isOpen) {
      // Use setTimeout to avoid immediate trigger
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Filter options based on search term
  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.sublabel?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get selected option label
  const selectedOption = options.find(opt => opt.value === value);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchTerm('');
  };

  const handleTriggerClick = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  // Dropdown menu rendered via Portal
  const dropdownMenu = isOpen && !disabled ? createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: `${dropdownPosition.top}px`,
        left: `${dropdownPosition.left}px`,
        width: `${dropdownPosition.width}px`,
        zIndex: 999999
      }}
      className="bg-white border-2 border-[#E5E5E5] rounded-lg shadow-2xl max-h-80 overflow-hidden"
    >
      {/* Search Input */}
      <div className="p-3 border-b border-[#E5E5E5]">
        <div className="relative">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8E93]" />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="جستجو..."
            className="ent-input pr-10 text-sm"
          />
        </div>
      </div>

      {/* Options List */}
      <div className="overflow-y-auto max-h-60">
        {filteredOptions.length === 0 ? (
          <div className="p-4 text-center ent-caption">
            گزینه‌ای یافت نشد
          </div>
        ) : (
          filteredOptions.map((option) => (
            <div
              key={option.value}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSelect(option.value);
              }}
              className={`p-3 cursor-pointer transition-colors border-b border-[#F7F8FA] last:border-b-0 ${
                value === option.value
                  ? 'bg-[#F0F6FF] border-r-4 border-r-[#0A6ED1]'
                  : 'hover:bg-[#F7F8FA]'
              }`}
              style={{ userSelect: 'none' }}
            >
              <div className="ent-body font-medium">{option.label}</div>
              {option.sublabel && (
                <div className="ent-caption text-xs mt-1">{option.sublabel}</div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer with count */}
      <div className="p-2 border-t border-[#E5E5E5] bg-[#F7F8FA]">
        <p className="ent-caption text-xs text-center">
          {filteredOptions.length} از {options.length} گزینه
        </p>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <div className="relative" ref={triggerRef}>
        {label && (
          <label className="ent-form-label block mb-2">
            {label}
          </label>
        )}
        
        {/* Dropdown Trigger */}
        <div
          onClick={handleTriggerClick}
          className={`ent-input cursor-pointer flex items-center justify-between ${
            error ? 'border-[#BB0000]' : ''
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex-1 text-right">
            {selectedOption ? (
              <div>
                <div className="ent-body">{selectedOption.label}</div>
                {selectedOption.sublabel && (
                  <div className="ent-caption text-xs">{selectedOption.sublabel}</div>
                )}
              </div>
            ) : (
              <span className="text-[#8A8E93]">{placeholder}</span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {value && !disabled && (
              <button
                onClick={handleClear}
                className="p-1 hover:bg-[#F7F8FA] rounded transition-colors"
              >
                <X size={14} className="text-[#8A8E93]" />
              </button>
            )}
            <ChevronDown
              size={16}
              className={`text-[#8A8E93] transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </div>
        </div>

        {error && (
          <p className="text-[#BB0000] text-xs mt-1">{error}</p>
        )}
      </div>

      {/* Render dropdown menu via Portal */}
      {dropdownMenu}
    </>
  );
}
