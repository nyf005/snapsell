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

    orderConfirmed: () =>
      `C'est validé ! 🙌 Ta commande est bien enregistrée.\n\nOn te recontacte très vite pour les détails de livraison. Merci de nous faire confiance 💛`,

    orderWithDeposit: (minutes: number) =>
      `Super ! Ta commande est enregistrée 🎉\n\nPour finaliser, on a besoin d'un acompte. Envoie la preuve de paiement ici dans les ${minutes} min 📸\n\nOn garde ton article de côté en attendant 🔒`,

    // --- Code lookup ---

    codeUnknown: (code: string) =>
      `Je n'ai pas trouvé l'article *${code}* 🔍\n\nVérifie le code vu lors du live et renvoie-le moi.`,

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

    // --- Handoff ---

    handedOff: () =>
      `Je transfère ta conversation à un membre de l'équipe 👤\n\nOn te répond très vite, merci de patienter 🙏`,

    // --- Messages interactifs (boutons) ---

    recapInteractive: (
      code: string,
      prix: string,
      total: string,
      address: string,
    ): InteractiveMessage => ({
      body: `Parfait ! Voici le récap de ta commande 👇\n\nArticle : *${code}*\n💰 Prix : ${prix}\n📍 Adresse : ${address}\n💳 Total : ${total}`,
      interactive: {
        type: "buttons",
        header: "🛍️ Récapitulatif",
        buttons: [
          { id: "confirm_order", title: "Confirmer ✅" },
          { id: "cancel_order", title: "Annuler ❌" },
          { id: "add_item", title: "Ajouter ➕" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Rappel expiration avec boutons Envoyer adresse / Annuler */
    reminderInteractive: (): InteractiveMessage => ({
      body: `Hey ! 👀 Ta réservation expire dans 2 minutes.\n\nEnvoie ton adresse vite pour ne pas la perdre 📍`,
      interactive: {
        type: "buttons",
        header: "⏳ Expiration proche",
        buttons: [
          { id: "send_proof", title: "Mon adresse 📍" },
          { id: "cancel_order", title: "Annuler ❌" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Expiration avec bouton Recommencer */
    reservationExpiredInteractive: (code: string): InteractiveMessage => ({
      body: `Ta réservation pour *${code}* a malheureusement expiré ⏰`,
      interactive: {
        type: "buttons",
        header: "⏰ Réservation expirée",
        buttons: [
          { id: `retry_code:${code}`, title: `Recommencer 🔄` },
          { id: "contact_agent", title: "Aide agent 👤" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Preuve rejetée avec boutons Renvoyer / Agent */
    proofRejectedInteractive: (orderNumber: string): InteractiveMessage => ({
      body: `Oops, ta preuve d'acompte pour *${orderNumber}* n'a pas pu être validée 😕`,
      interactive: {
        type: "buttons",
        header: "❌ Preuve rejetée",
        buttons: [
          { id: "send_proof", title: "Ma preuve 📸" },
          { id: "contact_agent", title: "Aide agent 👤" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Suggestion code avec boutons Oui / Non */
    codeSuggestionInteractive: (code: string): InteractiveMessage => ({
      body: `Je n'ai pas trouvé ce code. Tu voulais dire *${code}* ? 😊`,
      interactive: {
        type: "buttons",
        header: "🔍 Code introuvable",
        buttons: [
          { id: `retry_code:${code}`, title: `C'est bien ça ✅` },
          { id: "fallback_no", title: "Autre code ❌" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Fallback avec boutons Voir articles / Agent */
    fallbackInteractive: (): InteractiveMessage => ({
      body: `Je n'ai pas bien compris 😅\n\nEnvoie-moi le code de l'article que tu veux (ex : A12)`,
      interactive: {
        type: "buttons",
        header: "😅 Incompris",
        buttons: [
          { id: "contact_agent", title: "Aide agent 👤" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Liste d'attente promue avec boutons Envoyer adresse / Annuler */
    waitlistPromotedInteractive: (code: string): InteractiveMessage => ({
      body: `Bonne nouvelle ! 🎉 Une place s'est libérée pour l'article *${code}*.\n\nIl est réservé pour toi ! Envoie ton adresse de livraison 📍`,
      interactive: {
        type: "buttons",
        header: "🎉 Place libérée !",
        buttons: [
          { id: "send_proof", title: "Mon adresse 📍" },
          { id: "cancel_order", title: "Je ne veux plus ❌" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Acompte approuvé avec bouton Suivre commande */
    proofApprovedInteractive: (orderNumber: string): InteractiveMessage => ({
      body: `Ton acompte pour la commande *${orderNumber}* a été validé ! ✅\n\nTa commande est confirmée. On te recontacte pour la livraison 💛`,
      interactive: {
        type: "buttons",
        header: "✅ Acompte validé",
        buttons: [
          { id: "track_order", title: "Suivre commande 📦" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Commande confirmée avec bouton Suivre */
    orderConfirmedInteractive: (): InteractiveMessage => ({
      body: `C'est validé ! 🙌 Ta commande est bien enregistrée.\n\nOn te recontacte très vite pour les détails de livraison. Merci de nous faire confiance 💛`,
      interactive: {
        type: "buttons",
        header: "✅ Commande confirmée",
        buttons: [
          { id: "track_order", title: "Suivre commande 📦" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Acompte requis avec boutons Envoyer preuve / Agent */
    orderWithDepositInteractive: (minutes: number): InteractiveMessage => ({
      body: `Super ! Ta commande est enregistrée 🎉\n\nPour finaliser, envoie la preuve de paiement dans les ${minutes} min 📸\n\nOn garde ton article de côté en attendant 🔒`,
      interactive: {
        type: "buttons",
        header: "⚡ Action requise",
        buttons: [
          { id: "send_proof", title: "Ma preuve 📸" },
          { id: "contact_agent", title: "Aide agent 👤" },
        ],
      } satisfies InteractivePayload,
    }),
  },

  seller: {
    liveSummary: (opts: {
      liveDateLabel: string;
      orderCount: number;
      pendingReservations: number;
      pendingDeposit: number;
      unsoldItems: number;
      revenue: number;
    }) => {
      const revenueFormatted = opts.revenue.toLocaleString("fr-FR");
      return (
        `📊 *Résumé du live du ${opts.liveDateLabel}*\n\n` +
        `✅ Commandes confirmées : ${opts.orderCount}\n` +
        (opts.pendingDeposit > 0 ? `💳 En attente d'acompte : ${opts.pendingDeposit}\n` : "") +
        `⏳ Réservations en cours : ${opts.pendingReservations}\n` +
        `📦 Articles non vendus : ${opts.unsoldItems}\n` +
        `💰 Chiffre d'affaires : ${revenueFormatted} FCFA`
      );
    },

    itemCreated: (code: string, qty: number) =>
      `✅ *${code}* ajouté — ${qty} en stock`,

    itemCreatedWithPhoto: (code: string, qty: number) =>
      `✅ *${code}* ajouté — ${qty} en stock 📸`,

    itemAlreadyUsed: (code: string) =>
      `⚠️ Le code *${code}* est déjà utilisé dans cette session.\n\nChoisis un autre code (ex: ${code}B) ou libère le stock existant depuis le dashboard.`,

    catalogueAdded: (code: string, qty: number) =>
      `✅ *${code}* ajouté au catalogue — ${qty} en stock`,

    catalogueAddedWithPhoto: (code: string, qty: number) =>
      `✅ *${code}* ajouté au catalogue — ${qty} en stock 📸`,

    catalogueWithPhoto: (code: string) =>
      `✅ Photo ajoutée à *${code}*`,

    photoLinked: (code: string) =>
      `✅ Photo ajoutée à *${code}*`,

    photoNoCode: () =>
      `📸 Photo reçue, mais je ne sais pas à quel article la lier.\n\nAstuce : envoie la photo avec le code en légende (ex: *A12 x3*) pour la lier directement.`,

    noPriceConfigured: (letter: string) =>
      `⚠️ Aucun prix configuré pour la catégorie *${letter}*.\n\nVa dans le dashboard → Grille de prix pour l'ajouter.`,

    codeNotInCatalogue: (code: string) =>
      `⚠️ Le code *${code}* n'existe pas dans ton catalogue.\n\nCrée-le d'abord depuis le dashboard ou envoie-le avec une quantité (ex: *${code} 3*).`,

    codeAlreadyInStock: (code: string, availableQty: number) =>
      `⚠️ *${code}* a encore *${availableQty}* unité${availableQty > 1 ? "s" : ""} en stock.\n\nÉpuise d'abord ce stock ou choisis un autre code.`,

    liveCreateInstruction: () =>
      `ℹ️ En live, pas besoin d'écrire "ajout" ! Envoie juste le code (ex: *A12*) ou avec quantité (ex: *A12 x3*).`,

    sellerFallback: () =>
      `Je n'ai pas compris ce code 😅\n\nEnvoie juste le code (ex: *A12*) ou avec quantité (ex: *A12 x3*) pour créer l'article dans ce live.`,

    offLiveCreateInstruction: () =>
      `ℹ️ Hors live, utilise *ajout A12* ou *ajout A12 x3* pour créer un article.`,

    /** Confirmation ajout catalogue avec bouton Variantes */
    catalogueAddedInteractive: (code: string, qty: number): InteractiveMessage => ({
      body: `*${code}* ajouté au catalogue — ${qty} en stock`,
      interactive: {
        type: "buttons",
        header: "✅ Article Ajouté",
        buttons: [
          { id: `configure_variants:${code}`, title: "Variantes 🏷️" },
          { id: "no_variants", title: "Sans variantes ⏭️" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Confirmation ajout catalogue avec photo et bouton Variantes */
    catalogueAddedWithPhotoInteractive: (code: string, qty: number): InteractiveMessage => ({
      body: `*${code}* ajouté au catalogue — ${qty} en stock`,
      interactive: {
        type: "buttons",
        header: "✅ Article + Photo 📸",
        buttons: [
          { id: `configure_variants:${code}`, title: "Variantes 🏷️" },
          { id: "no_variants", title: "Sans variantes ⏭️" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Instructions de configuration des variantes par le vendeur (Story 8.2) */
    variantConfigInstructionsInteractive: (code: string, dimExample: string, example: string): InteractiveMessage => ({
      body: [
        `🏷️ Configuration des variantes pour *${code}* (${dimExample})`,
        ``,
        `Répondez avec vos variantes dans ce format :`,
        `\`Label:stock, Label:stock\``,
        ``,
        `📝 Exemple :`,
        `\`${example}\``,
        ``,
        `Les stocks à 0 seront créés mais marqués épuisés.`,
      ].join("\n"),
      interactive: {
        type: "buttons",
        header: "⚡ Action Requise",
        buttons: [
          { id: "cancel_variant_config", title: "Annuler config ❌" },
        ],
      } satisfies InteractivePayload,
    }),
  },
};
