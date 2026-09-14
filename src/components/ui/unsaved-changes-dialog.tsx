"use client";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./alert-dialog";

export function UnsavedChangesDialog({ open, onOpenChange, onDiscard }: { open: boolean; onOpenChange: (open: boolean) => void; onDiscard: () => void }) {
  return <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Quitter sans enregistrer ?</AlertDialogTitle><AlertDialogDescription>Vos dernières modifications seront perdues. Vous pouvez revenir au formulaire pour les enregistrer.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>Continuer à modifier</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={onDiscard}>Quitter sans enregistrer</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
