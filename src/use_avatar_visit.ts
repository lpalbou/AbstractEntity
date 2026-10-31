import { useCallback, useEffect, useState } from "react";
import { getVisitConversation, refusalText, type VisitConversationState } from "./stream_source";

/** Public projection only, while the optional presentation is visible. */
export function useAvatarVisit(baseUrl: string, entity: string, runId: string | null, active: boolean, busy: boolean) {
  const [stored, setStored] = useState<{ scope: string; value: VisitConversationState | null; error: string | null; loading: boolean }>({ scope: "", value: null, error: null, loading: false });
  const scope = `${baseUrl}:${entity}:${runId || ""}`;
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    if (!active || !runId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setStored((old) => old.scope === scope ? old : { scope, value: null, error: null, loading: true });
    const poll = async () => {
      try {
        const value = await getVisitConversation(baseUrl, entity, runId);
        if (!cancelled) setStored({ scope, value, error: null, loading: false });
      } catch (error) {
        if (!cancelled) setStored((old) => ({ scope, value: old.scope === scope ? old.value : null, error: `Public conversation could not be refreshed: ${refusalText(error as Error)}`, loading: false }));
      }
      if (!cancelled) timer = setTimeout(() => void poll(), busy ? 1200 : 4000);
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [baseUrl, entity, runId, scope, active, busy, revision]);
  const current = stored.scope === scope && active ? stored : { value: null, error: null, loading: Boolean(active && runId) };
  return { state: current.value, error: current.error, loading: current.loading, refresh };
}
