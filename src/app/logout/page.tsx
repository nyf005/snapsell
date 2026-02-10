"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";

/**
 * Page de déconnexion automatique (sans demande de confirmation).
 * Utilisée quand l'utilisateur ou le tenant n'existe plus en base :
 * le layout redirige ici et la session est invalidée immédiatement.
 */
export default function LogoutPage() {
  useEffect(() => {
    void signOut({ callbackUrl: "/login", redirect: true });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Déconnexion…</p>
    </div>
  );
}
