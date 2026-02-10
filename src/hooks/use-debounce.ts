import { useEffect, useState } from "react";

/**
 * Debounce une valeur. Retourne la valeur après `delay` ms d'inactivité.
 * (CR 7B-1 M4) – évite les requêtes à chaque frappe (correlationId, etc.)
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
