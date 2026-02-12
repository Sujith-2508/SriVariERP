import { RefObject } from 'react';

/**
 * Custom hook for handling Enter key navigation between form fields
 * @param fieldRefs - Array of refs to form fields in navigation order
 * @returns handleKeyDown function to attach to form fields
 */
export function useEnterKeyNavigation(
    fieldRefs: RefObject<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>[]
) {
    const handleKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
        if (e.key === 'Enter') {
            e.preventDefault();

            // Find next focusable field
            let nextIndex = currentIndex + 1;
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
