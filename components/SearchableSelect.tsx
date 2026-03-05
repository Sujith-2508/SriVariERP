'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

interface Option {
    id: string;
    name: string;
    [key: string]: any;
}

interface SearchableSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    autoFocus?: boolean;
    onKeyDown?: (e: React.KeyboardEvent) => void;
}

const SearchableSelect = React.forwardRef<any, SearchableSelectProps>((props, ref) => {
    const {
        options,
        value,
        onChange,
        placeholder = 'Select...',
        className = '',
        disabled = false,
        autoFocus = false,
        onKeyDown
    } = props;

    // Internal State
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const isTypingRef = useRef(false);

    // Identify Selected Option
    const selectedOption = useMemo(() =>
        options.find(opt => opt.id === value),
        [options, value]);

    // Sync Search Term with Value (External Changes)
    useEffect(() => {
        if (selectedOption) {
            setSearchTerm(selectedOption.name);
            isTypingRef.current = false;
        } else {
            // Only clear search term if NOT typing (i.e., external reset)
            if (!isTypingRef.current) {
                setSearchTerm('');
            }
        }
    }, [selectedOption, value]);

    // Expose focus method
    React.useImperativeHandle(ref, () => ({
        focus: () => {
            inputRef.current?.focus();
        }
    }));

    // Filter Options
    const filteredOptions = useMemo(() => {
        if (!searchTerm) return options;
        // If the search term matches the current selection exactly, show all (re-opening logic)
        // OR standard filter
        const term = searchTerm.toLowerCase();

        // If current text IS the selected item's name, show all options to allow changing
        if (selectedOption && searchTerm === selectedOption.name) {
            return options;
        }

        return options.filter(opt =>
            opt.name.toLowerCase().includes(term) ||
            (opt.id && opt.id.toLowerCase().includes(term))
        );
    }, [options, searchTerm, selectedOption]);

    // Reset Highlight when options change
    useEffect(() => {
        setHighlightedIndex(0);
    }, [filteredOptions]);

    // Auto-scroll highlighted item
    useEffect(() => {
        if (isOpen && listRef.current) {
            const highlightedItem = listRef.current.children[highlightedIndex] as HTMLElement;
            if (highlightedItem) {
                highlightedItem.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [highlightedIndex, isOpen]);

    // Handle Click Outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                isTypingRef.current = false;

                // If closing and no valid selection, revert or clear logic could go here.
                // For now, we leave it as is. If value is empty, it stays empty.
                // If user typed garbage and clicked away, value is empty.
                if (!value) {
                    setSearchTerm(''); // Clean up garbage text
                } else if (selectedOption) {
                    setSearchTerm(selectedOption.name); // Revert to valid name
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [value, selectedOption]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        isTypingRef.current = true;
        setIsOpen(true);
        if (value) {
            onChange(''); // Clear selection while typing
        }
    };

    const handleSelect = (option: Option) => {
        isTypingRef.current = false;
        onChange(option.id);
        setSearchTerm(option.name);
        setIsOpen(false);
    };

    const handleKeyDownInternal = (e: React.KeyboardEvent) => {
        if (disabled) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!isOpen) {
                setIsOpen(true);
            } else {
                setHighlightedIndex(prev => (prev + 1) % filteredOptions.length);
            }
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!isOpen) {
                setIsOpen(true);
            } else {
                setHighlightedIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
            }
            return;
        }

        if (e.key === 'Enter') {
            if (isOpen && filteredOptions.length > 0) {
                e.preventDefault();
                e.stopPropagation(); // Stop form submission
                handleSelect(filteredOptions[highlightedIndex]);
            } else {
                // Pass to parent (navigation)
                if (onKeyDown) onKeyDown(e);
            }
            return;
        }

        if (e.key === 'Escape') {
            setIsOpen(false);
            if (selectedOption) setSearchTerm(selectedOption.name);
            else setSearchTerm('');
            return;
        }

        if (e.key === 'Tab') {
            setIsOpen(false);
            // Let native tab handle focus move
        }
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <div className="relative group">
                <Search className="absolute left-3 top-2.5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
                <input
                    ref={inputRef}
                    type="text"
                    disabled={disabled}
                    autoFocus={autoFocus}
                    value={searchTerm}
                    onChange={handleInputChange}
                    onFocus={() => {
                        setIsOpen(true);
                        // Optional: Select text on focus for easier replace
                        // inputRef.current?.select(); 
                    }}
                    onKeyDown={handleKeyDownInternal}
                    placeholder={placeholder}
                    className={`w-full pl-10 pr-10 py-2.5 border rounded-lg outline-none transition-all
                        ${disabled ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-800'}
                        ${isOpen ? 'ring-2 ring-emerald-500/20 border-emerald-500' : 'border-slate-300 hover:border-slate-400'}
                    `}
                />

                {value && !disabled ? (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onChange('');
                            setSearchTerm('');
                            inputRef.current?.focus();
                        }}
                        className="absolute right-3 top-3 text-slate-400 hover:text-red-500 transition-colors"
                    >
                        <X size={16} />
                    </button>
                ) : (
                    <ChevronDown className={`absolute right-3 top-3 text-slate-400 pointer-events-none transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} size={16} />
                )}
            </div>

            {/* Dropdown */}
            {isOpen && !disabled && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top">
                    <div ref={listRef} className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option, index) => (
                                <div
                                    key={option.id}
                                    onClick={() => handleSelect(option)}
                                    className={`
                                        flex flex-col px-3 py-2.5 rounded-lg cursor-pointer transition-colors mb-0.5
                                        ${index === highlightedIndex ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-50'}
                                    `}
                                    onMouseEnter={() => setHighlightedIndex(index)}
                                >
                                    <div className="flex justify-between items-center w-full">
                                        <span className={`truncate text-sm ${index === highlightedIndex ? 'font-bold' : 'font-medium'}`}>
                                            {option.name}
                                        </span>
                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                            {option.stock !== undefined && (
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${option.stock <= 0 ? 'bg-red-100 text-red-700' :
                                                    option.stock < 50 ? 'bg-amber-100 text-amber-700' :
                                                        'bg-emerald-100 text-emerald-700'
                                                    }`}>
                                                    {Number(option.stock).toFixed(3)} qty
                                                </span>
                                            )}
                                            {option.id === value && <Check size={16} className="text-emerald-600 shrink-0" />}
                                        </div>
                                    </div>
                                    {option.description && (
                                        <span className={`text-[10px] truncate ${index === highlightedIndex ? 'text-emerald-600' : 'text-slate-400'}`}>
                                            {option.description}
                                        </span>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="p-4 text-center text-slate-400 text-sm italic">
                                No results found
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
});

SearchableSelect.displayName = 'SearchableSelect';

export default SearchableSelect;
