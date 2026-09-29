import { useEffect, useRef, useState } from "react";

// Runs fn(query, signal) once the person stops typing for `delay` ms. Cancels outdated requests.
export function useDebouncedSearch(query, fn, { delay = 350, minLength = 3 } = {}) {
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [error, setError] = useState("");
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const q = query.trim();
    if (q.length < minLength) {
      setResults([]);
      setStatus("idle");
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setStatus("loading");
      try {
        const r = await fnRef.current(q, ctrl.signal);
        setResults(r);
        setStatus("done");
      } catch (e) {
        if (e.name === "AbortError") return;
        setError(e.message || "Search failed.");
        setStatus("error");
      }
    }, delay);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, delay, minLength]);

  return { results, status, error };
}
