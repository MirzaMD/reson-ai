"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Debounces the RPM slider so we don't spam /response_at.
 */
export function useDebouncedRpm(rpm: number, delay = 150): number {
  const [debounced, setDebounced] = useState(rpm);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(rpm), delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [rpm, delay]);

  return debounced;
}