import { useEffect, useState } from "react";
import { lookOf, type IdentityLook } from "./identity_avatar";
import { getEntityIdentity, type IdentityRef } from "./stream_source";

/** The look an identity reference names (`GET /entities/{name}/identity?rev=N`), or null while there
 * is no reference or it is being read. A record of another entity than the reference names is
 * refused loudly (`onError`), never drawn. */
export function useIdentityLook(baseUrl: string, entity: string, ref: IdentityRef | null, onError: (message: string) => void): IdentityLook | null {
  const key = ref ? `${baseUrl}|${entity}|${ref.of}#${ref.rev}` : "";
  const [resolved, setResolved] = useState<{ key: string; look: IdentityLook | null }>({ key: "", look: null });
  useEffect(() => {
    if (!ref || resolved.key === key) return;
    let alive = true;
    getEntityIdentity(baseUrl, entity, ref.rev)
      .then((answer) => {
        if (!alive) return;
        if (answer.entity_id !== ref.of) {
          onError(`The visit names the identity of ${ref.of}, but ${entity} answered for ${answer.entity_id}.`);
          return;
        }
        setResolved({ key, look: lookOf(answer.identity) });
      })
      .catch((e: Error) => alive && onError(`Its look could not be read: ${e.message}`));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return ref && resolved.key === key ? resolved.look : null;
}
