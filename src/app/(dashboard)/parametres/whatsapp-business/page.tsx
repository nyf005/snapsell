import { permanentRedirect } from "next/navigation";

/**
 * « Profil WhatsApp Business » est replié dans /parametres/whatsapp : les horaires
 * sont partis vers /parametres/reponses, le reste (catalogue Meta, modèles de
 * message) vit sous « Fonctions avancées ».
 */
export default function WhatsAppBusinessRedirectPage() {
  permanentRedirect("/parametres/whatsapp");
}
