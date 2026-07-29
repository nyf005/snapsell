"use client";

import { usePathname } from "next/navigation";

import { isAppShellPath } from "~/lib/navigation";

/**
 * Animation d'entrée de page — mais pas sur les coquilles applicatives.
 *
 * Un `template.tsx` racine enveloppe TOUT, y compris `(dashboard)/layout.tsx`,
 * dans un `<div>` animé. Or `page-in` anime `transform`, et une valeur de
 * `transform` autre que `none` fait de l'élément le **bloc conteneur des
 * descendants `position: fixed`** — ceux-ci ne se positionnent plus par rapport
 * au viewport mais par rapport à ce div.
 *
 * Conséquence observée, et mesurée : une sonde `position:fixed; bottom:0`
 * placée dans ce div atterrissait à 6 200px au lieu de 720, le bas du viewport.
 * Dans le tableau de bord, ce div fait la hauteur de la coquille — donc la
 * `MobileBottomNav` semblait correcte au chargement, puis passait sous la barre
 * d'adresse du navigateur mobile dès la navigation suivante. La barre latérale
 * de bureau (`fixed inset-y-0`) et le lien d'évitement dépendaient du même
 * positionnement.
 *
 * Deux raisons de sortir les coquilles de l'animation plutôt que de bricoler le
 * positionnement :
 *
 * 1. `template.tsx` se remonte à CHAQUE navigation. Sur le tableau de bord,
 *    cela rejouait le fondu-glissé sur toute la coquille — barre latérale et
 *    barre mobile comprises — alors que ces éléments ne changent pas d'une page
 *    à l'autre. Une coquille d'application ne doit pas clignoter quand seul son
 *    contenu change ;
 * 2. tant qu'un ancêtre porte un `transform`, tout `position: fixed` ajouté
 *    plus tard dans ces pages sera silencieusement cassé. Le piège se
 *    retendrait tout seul.
 *
 * Les pages publiques et d'authentification gardent l'animation : elles n'ont
 * aucun élément `fixed` (vérifié) et le fondu y a du sens, on change vraiment
 * d'écran.
 *
 * La liste des coquilles vit dans `~/lib/navigation` — source unique — et son
 * test empêche qu'une nouvelle coquille soit oubliée ici.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isAppShellPath(pathname)) return <>{children}</>;

  return <div className="animate-page-in">{children}</div>;
}
