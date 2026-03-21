import { RefObject } from 'react';

/**
 * Custom hook for handling keyboard navigation between form fields
 * - Enter  → move to next field (or submit if on last field)
 * - ArrowRight (when cursor at end)  → move to next field
 * - ArrowLeft  (when cursor at start) → move to previous field
 *
 * @param fieldRefs       Array of refs in navigation order
 * @param onLastFieldEnter Optional callback fired when Enter is pressed on the last field
 */
export function useEnterKeyNavigation(
    fieldRefs: { current: HTMLElement | null }[],
    onLastFieldEnter?: () => void
) {
    const focusField = (index: number) => {
        const field = fieldRefs[index]?.current;
        if (!field) return false;

        // Skip disabled or hidden fields
        if ((field as any).disabled || field.offsetParent === null) return false;

        field.focus();
        if (field instanceof HTMLSelectElement) field.click();
        return true;
    };

    const focusNext = (currentIndex: number) => {
        let next = currentIndex + 1;
        while (next < fieldRefs.length) {
            if (focusField(next)) return true;
            next++;
        }
        return false; // reached end
    };

    const focusPrev = (currentIndex: number) => {
        let prev = currentIndex - 1;
        while (prev >= 0) {
            if (focusField(prev)) return true;
            prev--;
        }
        return false;
    };

    const getCurrentIndex = (e: React.KeyboardEvent) => {
        const idx = fieldRefs.findIndex(ref => ref.current === e.currentTarget);
        return idx !== -1 ? idx : 0;
    };

    /** True when the text cursor sits at position 0 (or the element has no selectionStart) */
    const cursorAtStart = (el: EventTarget) => {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            return (el.selectionStart ?? 0) === 0;
        }
        return true; // select / button — always allow
    };

    const cursorAtEnd = (el: EventTarget) => {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            return (el.selectionStart ?? 0) >= (el.value?.length ?? 0);
        }
        return true;
    };

    const isNumberInput = (el: EventTarget) => {
        return el instanceof HTMLInputElement && el.type === 'number';
    };

    const handleKeyDown = (e: React.KeyboardEvent, passedIndex?: number) => {
        const activeIndex = passedIndex ?? getCurrentIndex(e);

        if (e.key === 'Enter') {
            e.preventDefault();
            const moved = focusNext(activeIndex);
            if (!moved && onLastFieldEnter) {
                onLastFieldEnter(); // last field — trigger save / submit
            }
            return;
        }

        if (e.key === 'ArrowRight' && !isNumberInput(e.currentTarget) && cursorAtEnd(e.currentTarget)) {
            // Only hijack arrow when cursor is at the end of text
            e.preventDefault();
            focusNext(activeIndex);
            return;
        }

        if (e.key === 'ArrowLeft' && !isNumberInput(e.currentTarget) && cursorAtStart(e.currentTarget)) {
            // Only hijack arrow when cursor is at the start of text
            e.preventDefault();
            focusPrev(activeIndex);
            return;
        }
    };

    return { handleKeyDown };
}
