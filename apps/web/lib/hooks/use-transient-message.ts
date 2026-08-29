"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useTransientMessage(duration = 2_800) {
  const [message, setMessage] = useState("");
  const timeoutRef = useRef<number | null>(null);

  const showMessage = useCallback((nextMessage: string) => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    setMessage(nextMessage);
    timeoutRef.current = nextMessage
      ? window.setTimeout(() => {
          setMessage("");
          timeoutRef.current = null;
        }, duration)
      : null;
  }, [duration]);

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  return [message, showMessage] as const;
}
