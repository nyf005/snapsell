"use client";
import { Button } from "~/components/ui/button";
export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return <main className="mx-auto w-full max-w-xl space-y-4 p-6"><h1 className="text-2xl font-semibold">Cette page n’a pas pu être chargée</h1><p className="text-muted-foreground">Réessayez pour retrouver votre travail.</p><Button onClick={reset}>Réessayer</Button></main>;
}
