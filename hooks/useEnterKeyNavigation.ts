import { RefObject } from 'react';

/**
 * Custom hook for handling Enter key navigation between form fields
 * @param fieldRefs - Array of refs to form fields in navigation order
 * @returns handleKeyDown function to attach to form fields
 */
export function useEnterKeyNavigation(
    fieldRefs: RefObject<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>[]
) {
    const handleKeyDown = (e: React.KeyboardEvent, passedIndex?: number) => {
        if (e.key === 'Enter') {
            e.preventDefault();

            // Find current field index dynamically for robustness
            const currentIndex = fieldRefs.findIndex(ref => ref.current === e.currentTarget);

            // Fallback to passed index if dynamic find fails (shouldn't happen for valid refs)
            const activeIndex = currentIndex !== -1 ? currentIndex : (passedIndex || 0);

            // Find next focusable field
            let nextIndex = activeIndex + 1;
            while (nextIndex < fieldRefs.length) {
                const nextField = fieldRefs[nextIndex]?.current;

                // Skip disabled or hidden fields
                if (nextField && !nextField.disabled && nextField.offsetParent !== null) {
                    nextField.focus();

                    // If it's a select, open the dropdown
                    if (nextField instanceof HTMLSelectElement) {
                        nextField.click();
                    }
                    return;
                }
                nextIndex++;
            }

            // If no next field found, we're at the end - could trigger form submission
            // But we'll leave that to the form's onSubmit handler
        }
    };

    return { handleKeyDown };
}
