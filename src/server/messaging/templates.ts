/**
 * Centralized bot message templates.
 * All strings sent to clients or sellers via WhatsApp should live here.
 * Client messages: warm, human, concise.
 * Seller messages: functional, clear.
 */

import type { InteractivePayload, OutboundMessage } from "./types";

type InteractiveMessage = Pick<OutboundMessage, "body" | "interactive">;

export const botMsg = {
  client: {
    // --- Reservation flow ---

    reserved: (code: string) =>
      `Super choix ! 🎉 L'article *${code}* est réservé pour toi.\n\nEnvoie-moi ton adresse de livraison stp 📍\n\n_(Tu pourras ajouter d'autres articles juste après !)_`,

    exhausted: () =>
      `Oh non, cet article vient d'être épuisé 😔`,

    waitlist: (code: string, position: number) =>
      `Oh non, l'article *${code}* est épuisé 😔\n\nJe t'ajoute en liste d'attente à la position #${position}. Si une place se libère, tu seras prévenu(e) automatiquement ! 🔔`,

    recap: (code: string, prix: string, total: string, address: string) =>
      `Parfait ! Voici le récap de ta commande 👇\n\n🛍️ Article : *${code}*\n💰 Prix : ${prix}\n📍 Adresse : ${address}\n💳 Total : ${total}\n\nTout est bon ? Réponds *OUI* pour confirmer ✅`,

    orderConfirmed: () =>
      `C'est validé ! 🙌 Ta commande est bien enregistrée.\n\nOn te recontacte très vite pour les détails de livraison. Merci de nous faire confiance 💛`,

    orderWithDeposit: (minutes: number) =>
      `Super ! Ta commande est enregistrée 🎉\n\nPour finaliser, on a besoin d'un acompte. Envoie la preuve de paiement ici dans les ${minutes} min 📸\n\nOn garde ton article de côté en attendant 🔒`,

    // --- Code lookup ---

    codeUnknown: (code: string) =>
      `Je n'ai pas trouvé l'article *${code}* 🔍\n\nVérifie le code vu lors du live et renvoie-le moi.`,

    codeUnknownNoSession: (code: string) =>
      `Je n'ai pas trouvé l'article *${code}* 😕\n\nLe live est peut-être terminé. Si tu as vu cet article, il sera disponible dans notre catalogue prochainement.`,

    codeSuggestion: (code: string) =>
      `Je n'ai pas trouvé ce code. Tu voulais dire *${code}* ? Renvoie-le moi 😊`,

    // --- Phase 2: new automation messages ---

    welcome: (shopName: string) =>
      `Bonjour ! 👋 Bienvenue chez *${shopName}*.\n\nTu as vu un article qui t'intéresse lors du live ? Envoie-moi son code (ex : A12) et je m'occupe de toi 😊`,

    fallback: () =>
      `Je n'ai pas bien compris 😅\n\nEnvoie-moi le code de l'article que tu veux (ex : A12) et je m'occupe du reste !`,

    orderStatus: (orderNumber: string) =>
      `Ta commande *${orderNumber}* est bien enregistrée ✅\n\nOn te recontacte très vite pour les détails de livraison 🚚`,

    // --- Order status notifications ---

    orderDelivered: (orderNumber: string) =>
      `Ta commande *${orderNumber}* a bien été livrée ! 🎉\n\nMerci de ta confiance 💛`,

    orderCancelled: (orderNumber: string) =>
      `Ta commande *${orderNumber}* a été annulée 😔\n\nN'hésite pas à nous écrire si tu as des questions.`,

    orderInDelivery: (orderNumber: string) =>
      `Bonne nouvelle ! 🚚 Ta commande *${orderNumber}* est en cours de livraison.\n\nTu la reçois très bientôt !`,

    // --- Payment proof notifications ---

    proofApproved: (orderNumber: string) =>
      `Ton acompte pour la commande *${orderNumber}* a été validé ! ✅\n\nTa commande est confirmée. On te recontacte pour la livraison 💛`,

    proofRejected: (orderNumber: string) =>
      `Oops, ta preuve d'acompte pour *${orderNumber}* n'a pas pu être validée 😕\n\nRenvoie une nouvelle preuve ou contacte-nous directement.`,

    // --- Reminder & expiration ---

    reminder: () =>
      `Hey ! 👀 Ta réservation expire dans 2 minutes.\n\nEnvoie ton adresse vite pour ne pas la perdre 📍`,

    reservationExpired: (code: string) =>
      `Ta réservation pour *${code}* a malheureusement expiré ⏰\n\nSi l'article est encore disponible, renvoie simplement le code *${code}* pour recommencer 💪`,

    // --- Waitlist promotion ---

    waitlistPromoted: (code: string) =>
      `Bonne nouvelle ! 🎉 Une place s'est libérée pour l'article *${code}*.\n\nIl est réservé pour toi ! Envoie ton adresse de livraison 📍`,

    // --- Handoff ---

    handedOff: () =>
      `Je transfère ta conversation à un membre de l'équipe 👤\n\nOn te répond très vite, merci de patienter 🙏`,

    // --- Messages interactifs (boutons) ---

    /** Récap commande avec boutons Confirmer / Annuler / Ajouter un article */
    recapInteractive: (
      code: string,
      prix: string,
      total: string,
      address: string,
    ): InteractiveMessage => ({
      body: `Parfait ! Voici le récap de ta commande 👇\n\n🛍️ Article : *${code}*\n💰 Prix : ${prix}\n📍 Adresse : ${address}\n💳 Total : ${total}`,
      interactive: {
        type: "buttons",
        buttons: [
          { id: "confirm_order", title: "✅ Confirmer" },
          { id: "cancel_order", title: "❌ Annuler" },
          { id: "add_item", title: "➕ Ajouter article" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Rappel expiration avec boutons Envoyer adresse / Annuler */
    reminderInteractive: (): InteractiveMessage => ({
      body: `Hey ! 👀 Ta réservation expire dans 2 minutes.\n\nEnvoie ton adresse vite pour ne pas la perdre 📍`,
      interactive: {
        type: "buttons",
        buttons: [
          { id: "send_proof", title: "📍 J'envoie mon adresse" },
          { id: "cancel_order", title: "❌ Annuler" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Expiration avec bouton Recommencer */
    reservationExpiredInteractive: (code: string): InteractiveMessage => ({
      body: `Ta réservation pour *${code}* a malheureusement expiré ⏰`,
      interactive: {
        type: "buttons",
        buttons: [
          { id: `retry_code:${code}`, title: `🔄 Recommencer` },
          { id: "contact_agent", title: "👤 Parler à un agent" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Preuve rejetée avec boutons Renvoyer / Agent */
    proofRejectedInteractive: (orderNumber: string): InteractiveMessage => ({
      body: `Oops, ta preuve d'acompte pour *${orderNumber}* n'a pas pu être validée 😕`,
      interactive: {
        type: "buttons",
        buttons: [
          { id: "send_proof", title: "📸 Renvoyer ma preuve" },
          { id: "contact_agent", title: "👤 Parler à un agent" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Suggestion code avec boutons Oui / Non */
    codeSuggestionInteractive: (code: string): InteractiveMessage => ({
      body: `Je n'ai pas trouvé ce code. Tu voulais dire *${code}* ? 😊`,
      interactive: {
        type: "buttons",
        buttons: [
          { id: `retry_code:${code}`, title: `✅ Oui, c'est ${code}` },
          { id: "fallback_no", title: "❌ Non, autre code" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Fallback avec boutons Voir articles / Agent */
    fallbackInteractive: (): InteractiveMessage => ({
      body: `Je n'ai pas bien compris 😅\n\nEnvoie-moi le code de l'article que tu veux (ex : A12)`,
      interactive: {
        type: "buttons",
        buttons: [
          { id: "contact_agent", title: "👤 Parler à un agent" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Commande confirmée avec bouton Suivre */
    orderConfirmedInteractive: (): InteractiveMessage => ({
      body: `C'est validé ! 🙌 Ta commande est bien enregistrée.\n\nOn te recontacte très vite pour les détails de livraison. Merci de nous faire confiance 💛`,
      interactive: {
        type: "buttons",
        buttons: [
          { id: "track_order", title: "📦 Suivre ma commande" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Acompte requis avec boutons Envoyer preuve / Agent */
    orderWithDepositInteractive: (minutes: number): InteractiveMessage => ({
      body: `Super ! Ta commande est enregistrée 🎉\n\nPour finaliser, envoie la preuve de paiement dans les ${minutes} min 📸\n\nOn garde ton article de côté en attendant 🔒`,
      interactive: {
        type: "buttons",
        buttons: [
          { id: "send_proof", title: "📸 Envoyer ma preuve" },
          { id: "contact_agent", title: "👤 Parler à un agent" },
        ],
      } satisfies InteractivePayload,
    }),
  },

  seller: {
    liveSummary: (opts: {
      orderCount: number;
      pendingReservations: number;
      unsoldItems: number;
      revenue: number;
    }) => {
      const revenueFormatted = opts.revenue.toLocaleString("fr-FR");
      return (
        `📊 *Résumé de ta session live*\n\n` +
        `✅ Commandes créées : ${opts.orderCount}\n` +
        `⏳ Réservations en attente : ${opts.pendingReservations}\n` +
        `📦 Articles non vendus : ${opts.unsoldItems}\n` +
        `💰 Chiffre d'affaires : ${revenueFormatted} FCFA`
      );
    },

    itemCreated: (code: string, qty: number) =>
      `Créé : ${code} (x${qty}) ✅`,

    itemCreatedWithPhoto: (code: string, qty: number) =>
      `Créé : ${code} (x${qty}) ✅ Photo ajoutée au catalogue.`,

    itemAlreadyUsed: (code: string) =>
      `Code déjà utilisé, choisis un autre ou envoie MODIF ${code} …`,

    catalogueAdded: (code: string, qty: number) =>
      `Ajouté au catalogue : ${code} (x${qty}) ✅`,

    catalogueWithPhoto: (code: string) =>
      `Photo ajoutée à ${code} ✅`,

    photoLinked: (code: string) =>
      `Photo ajoutée à ${code} ✅`,

    photoNoCode: () =>
      `Envoie d'abord CODE PRIX`,

    noPriceConfigured: (letter: string) =>
      `Pas de prix configuré pour la catégorie « ${letter} ». Configure les prix dans le dashboard.`,

    codeNotInCatalogue: (code: string) =>
      `Code ${code} introuvable dans ton catalogue. Crée l'article d'abord (dashboard ou envoie ${code} x1).`,

    codeAlreadyInStock: (code: string, availableQty: number) =>
      `${code} est déjà en stock (${availableQty} dispo). Épuise le stock actuel ou choisis un autre code.`,
  },
};
