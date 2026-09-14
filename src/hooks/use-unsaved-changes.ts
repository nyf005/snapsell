"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
/** Guard explicit navigation without interfering with same-page links or new tabs. */
export function useUnsavedChanges(dirty: boolean) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const next = new URL(link.href, location.href);
      if (next.origin === location.origin && next.pathname === location.pathname && next.search === location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(next.href);
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty]);
  return {
    open: pendingHref !== null,
    onOpenChange: (open: boolean) => { if (!open) setPendingHref(null); },
    onDiscard: () => {
      if (!pendingHref) return;
      const next = new URL(pendingHref);
      setPendingHref(null);
      if (next.origin === location.origin) router.push(next.pathname + next.search + next.hash);
      else window.location.assign(next.href);
    },
  };
}
