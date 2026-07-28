import { permanentRedirect } from "next/navigation";

/**
 * Les réponses FAQ ont rejoint les horaires et le message d'absence sur
 * /parametres/reponses : c'est le même métier — ce que l’assistant dit à votre place.
 */
export default function FaqRedirectPage() {
  permanentRedirect("/parametres/reponses");
}
