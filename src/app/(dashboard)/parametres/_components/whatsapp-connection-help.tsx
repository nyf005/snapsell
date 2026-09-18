"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, CircleHelp, X } from "lucide-react";
import { Button } from "~/components/ui/button";

const TOPICS = [
  {
    "title": "Quel portefeuille business choisir ?",
    "answer": "Si votre entreprise possède déjà un portefeuille business Meta, utilisez-le avec un compte qui dispose des droits administrateur. Vous éviterez de créer un doublon."
  },
  {
    "title": "Meta indique une limite de création",
    "answer": "Si Meta vous propose un portefeuille existant de votre entreprise, sélectionnez-le. Sinon, réglez la limite dans Meta avant de reprendre. Si une suppression est en cours, attendez sa confirmation avant de relancer la connexion."
  },
  {
    "title": "Que renseigner si Meta demande un site web ?",
    "answer": "Indiquez le site de votre activité. Si vous n’en avez pas, vérifiez si ce formulaire autorise le lien de votre page Facebook professionnelle ou de votre profil Instagram professionnel. Si Meta le refuse, contactez l’assistance SnapSell pour vérifier la suite."
  },
  {
    "title": "Je ne reçois pas le message Facebook Business",
    "answer": "Dans WhatsApp Business, ouvrez Réglages ou Paramètres, puis Compte et Business Platform (ou Plateforme professionnelle). Si cette option est absente, vérifiez le numéro saisi et mettez l’application à jour."
  }
];

export function WhatsAppConnectionHelp() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const topic = selected === null ? undefined : TOPICS[selected];

  return (
    <section className="mt-5 w-full min-w-0 border-t border-border pt-3" aria-label="Aide à la connexion Meta">
      {!open ? (
        <Button type="button" variant="ghost" className="min-h-11 whitespace-normal text-left" aria-expanded={false} onClick={() => setOpen(true)}>
          <CircleHelp className="size-4 shrink-0" aria-hidden="true" /> Un problème avec Meta ?
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold">{topic ? "Votre prochaine étape" : "Qu’est-ce qui vous bloque ?"}</h3>
            <Button type="button" variant="ghost" className="min-h-11 shrink-0" onClick={() => { setOpen(false); setSelected(null); }}>
              <X className="size-4" aria-hidden="true" /> Fermer
            </Button>
          </div>
          {topic ? (
            <div aria-live="polite" className="space-y-3">
              <h4 className="text-sm font-medium">{topic.title}</h4>
              <p className="text-sm leading-6 text-muted-foreground">{topic.answer}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" className="min-h-11" onClick={() => setSelected(null)}>
                  <ArrowLeft className="size-4" aria-hidden="true" /> Autre problème
                </Button>
                <Link href="/aide" className="inline-flex min-h-11 items-center px-2 text-sm text-primary underline">Contacter l’assistance</Link>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {TOPICS.map((item, index) => (
                <li key={item.title}>
                  <button type="button" onClick={() => setSelected(index)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-2 py-3 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span>{item.title}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
              <li><Link href="/aide" className="inline-flex min-h-11 items-center px-2 py-3 text-sm text-primary underline">Mon problème n’est pas dans la liste</Link></li>
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
