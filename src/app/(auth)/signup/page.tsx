"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SignupPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login?tab=signup", { scroll: false });
  }, [router]);

  return (
    <div className="max-w-[480px] w-full flex flex-col gap-8">
      <p className="text-muted-foreground">Redirection vers la page de connexion…</p>
    </div>
  );
}
