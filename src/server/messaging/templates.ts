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
      `✅ *${code} est réservé pour toi.*\n\nProchaine étape : envoie ton adresse de livraison 📍\n\nTu pourras ajouter d’autres articles ensuite.`,

    exhausted: () =>
      `Article épuisé.\n\nIl n’est plus disponible pour le moment.`,

    waitlist: (code: string, position: number) =>
      `⏳ *${code} est déjà réservé.*\n\nTu es en file d’attente, position *n° ${position}*. Je te préviens automatiquement si l’article se libère.`,

    orderConfirmed: () =>
      `✅ *Commande confirmée.*\n\nOn te contacte pour organiser la livraison.`,

    orderWithDeposit: (minutes: number) =>
      `⏳ *Commande en attente d’acompte.*\n\nEnvoie la preuve de paiement ici dans les *${minutes} minutes* 📸\n\nL’article reste réservé pendant ce délai.`,

    // --- Code lookup ---

    codeUnknown: (code: string) =>
      `🔍 *Code ${code} introuvable.*\n\nVérifie le code affiché pendant le live, puis renvoie-le.`,

    codeSuggestion: (code: string) =>
      `🔍 *Code introuvable.*\n\nTu voulais dire *${code}* ?`,

    // --- Phase 2: new automation messages ---

    welcome: (shopName: string) =>
      `Bonjour 👋 Bienvenue chez *${shopName}*.\n\nEnvoie le code de l’article qui t’intéresse, par exemple *A12*.`,

    fallback: () =>
      `Je n’ai pas reconnu ce message.\n\nEnvoie le code de l’article, par exemple *A12*, ou demande de l’aide.`,

    orderStatus: (orderNumber: string) =>
      `✅ *Commande ${orderNumber} confirmée.*\n\nOn te contacte pour organiser la livraison.`,

    // --- Order status notifications ---

    orderDelivered: (orderNumber: string) =>
      `✅ *Commande ${orderNumber} livrée.*\n\nMerci pour ta confiance.`,

    orderCancelled: (orderNumber: string) =>
      `❌ *Commande ${orderNumber} annulée.*\n\nÉcris-nous si tu as besoin d’aide.`,

    orderInDelivery: (orderNumber: string) =>
      `🚚 *Commande ${orderNumber} en livraison.*\n\nElle est en route vers toi.`,

    // --- Deposit proof ---

    proofReceived: (orderNumber: string) =>
      `✅ *Preuve reçue pour ${orderNumber}.*\n\nElle doit maintenant être vérifiée. Je te préviens du résultat.`,

    sendProofNow: () =>
      `📸 *Envoie ta preuve de paiement.*\n\nUne capture d’écran ou une photo du reçu convient.`,

    depositExpired: (orderNumber: string) =>
      `⌛ *Commande ${orderNumber} expirée.*\n\nAucune preuve de paiement n’a été reçue dans le délai. Tu peux envoyer un nouveau code pour recommencer.`,

    // --- Handoff ---

    handedOff: () =>
      `👤 *Conversation transmise à l’équipe.*\n\nUn membre de l’équipe te répondra dès que possible.`,

    // --- Messages interactifs (boutons) ---

    recapInteractive: (
      code: string,
      prix: string,
      total: string,
      address: string,
      /** Frais de livraison. `null` → « à confirmer » : mieux vaut annoncer
       *  l’incertitude que facturer un montant non choisi par la vendeuse. */
      livraison: string | null = null,
    ): InteractiveMessage => ({
      body: `🧾 *Commande prête à confirmer.*\n\nArticle : *${code}*\nPrix : ${prix}\nAdresse : ${address}\nLivraison : ${livraison ?? "à confirmer"}\nTotal : *${total}*\n\nVérifie les informations, puis choisis une action.`,
      interactive: {
        type: "buttons",
        header: "🛍️ Récapitulatif",
        buttons: [
          { id: "confirm_order", title: "Confirmer ✅" },
          { id: "cancel_order", title: "Annuler" },
          { id: "add_item", title: "Ajouter un article" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Rappel expiration avec boutons Envoyer adresse / Annuler */
    reminderInteractive: (): InteractiveMessage => ({
      body: `⏳ *Réservation bientôt expirée.*\n\nIl reste 2 minutes. Envoie ton adresse maintenant pour garder l’article.`,
      interactive: {
        type: "buttons",
        header: "⏳ Expiration proche",
        buttons: [
          { id: "send_proof", title: "Envoyer l’adresse" },
          { id: "cancel_order", title: "Annuler" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Expiration avec bouton Recommencer */
    reservationExpiredInteractive: (code: string): InteractiveMessage => ({
      body: `⌛ *Réservation ${code} expirée.*\n\nL’article n’est plus réservé à ton nom. Tu peux recommencer ou demander de l’aide.`,
      interactive: {
        type: "buttons",
        header: "⏰ Réservation expirée",
        buttons: [
          { id: `retry_code:${code}`, title: `Recommencer` },
          { id: "contact_agent", title: "Demander de l’aide" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Preuve rejetée avec boutons Renvoyer / Agent */
    proofRejectedInteractive: (orderNumber: string): InteractiveMessage => ({
      body: `❌ *Preuve refusée pour ${orderNumber}.*\n\nEnvoie une nouvelle preuve lisible ou demande de l’aide.`,
      interactive: {
        type: "buttons",
        header: "❌ Preuve rejetée",
        buttons: [
          { id: "send_proof", title: "Renvoyer la preuve" },
          { id: "contact_agent", title: "Demander de l’aide" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Suggestion code avec boutons Oui / Non */
    codeSuggestionInteractive: (code: string): InteractiveMessage => ({
      body: `🔍 *Code introuvable.*\n\nTu voulais dire *${code}* ?`,
      interactive: {
        type: "buttons",
        header: "🔍 Code introuvable",
        buttons: [
          { id: `retry_code:${code}`, title: `Oui, ${code}` },
          { id: "fallback_no", title: "Saisir un autre code" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Fallback avec boutons Voir articles / Agent */
    fallbackInteractive: (): InteractiveMessage => ({
      body: `Je n’ai pas reconnu ce message.\n\nEnvoie le code de l’article, par exemple *A12*, ou demande de l’aide.`,
      interactive: {
        type: "buttons",
        header: "😅 Incompris",
        buttons: [
          { id: "contact_agent", title: "Demander de l’aide" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Liste d’attente promue avec boutons Envoyer adresse / Annuler */
    waitlistPromotedInteractive: (code: string): InteractiveMessage => ({
      body: `✅ *${code} est maintenant réservé pour toi.*\n\nUne place s’est libérée. Envoie ton adresse de livraison pour confirmer.`,
      interactive: {
        type: "buttons",
        header: "🎉 Place libérée !",
        buttons: [
          { id: "send_proof", title: "Envoyer l’adresse" },
          { id: "cancel_order", title: "Libérer l’article" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Acompte approuvé avec bouton Suivre commande */
    proofApprovedInteractive: (orderNumber: string): InteractiveMessage => ({
      body: `✅ *Acompte validé pour ${orderNumber}.*\n\nLa commande est confirmée. On te contacte pour la livraison.`,
      interactive: {
        type: "buttons",
        header: "✅ Acompte validé",
        buttons: [
          { id: "track_order", title: "Suivre la commande" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Commande confirmée avec bouton Suivre */
    orderConfirmedInteractive: (): InteractiveMessage => ({
      body: `✅ *Commande confirmée.*\n\nOn te contacte pour organiser la livraison.`,
      interactive: {
        type: "buttons",
        header: "✅ Commande confirmée",
        buttons: [
          { id: "track_order", title: "Suivre la commande" },
        ],
      } satisfies InteractivePayload,
    }),

    /** Acompte requis avec boutons Envoyer preuve / Agent */
    orderWithDepositInteractive: (minutes: number): InteractiveMessage => ({
      body: `⏳ *Commande en attente d’acompte.*\n\nEnvoie la preuve de paiement dans les *${minutes} minutes*. L’article reste réservé pendant ce délai.`,
      interactive: {
        type: "buttons",
        header: "⚡ Action requise",
        buttons: [
          { id: "send_proof", title: "Envoyer la preuve" },
          { id: "contact_agent", title: "Demander de l’aide" },
        ],
      } satisfies InteractivePayload,
    }),

    // --- WhatsApp Business catalogue natif ---

    /** Fiche produit cliquable depuis le catalogue Meta (P3) */
    productCard: (
      catalogId: string,
      productRetailerId: string,
      body = "Voici l’article que tu as demandé 👇",
    ): InteractiveMessage => ({
      body,
      interactive: {
        type: "product",
        catalogId,
        productRetailerId,
      } satisfies InteractivePayload,
    }),

    /** Liste multi-produits depuis le catalogue Meta (P3) */
    productList: (
      catalogId: string,
      header: string,
      sections: Array<{ title: string; items: Array<{ productRetailerId: string }> }>,
      body = "Voici les articles disponibles 👇",
    ): InteractiveMessage => ({
      body,
      interactive: {
        type: "product_list",
        header,
        catalogId,
        sections,
      } satisfies InteractivePayload,
    }),

    /** Récap multi-articles après commande via panier natif (P1) */
    orderSummaryInteractive: (
      lines: Array<{ code: string; qty: number; prix: string }>,
      address: string,
      total: string,
    ): InteractiveMessage => {
      const itemsText = lines
        .map((l) => `• *${l.code}* x${l.qty} — ${l.prix}`)
        .join("\n");
      return {
        body: `Récap de ta commande 👇\n\n${itemsText}\n\n📍 Adresse : ${address}\n💳 Total : ${total}`,
        interactive: {
          type: "buttons",
          header: "🛍️ Récapitulatif",
          buttons: [
            { id: "confirm_order", title: "Confirmer ✅" },
            { id: "cancel_order", title: "Annuler ❌" },
          ],
        } satisfies InteractivePayload,
      };
    },

    /** Away message hors horaires avec boutons (Phase 4) */
    awayMessageInteractive: (awayText: string, shopName: string): InteractiveMessage => ({
      body: awayText || `Bonjour ! 👋 *${shopName}* est actuellement fermé.\n\nReviens pendant nos heures d’ouverture ou laisse un message, je te réponds dès que possible 🙏`,
      interactive: {
        type: "buttons",
        header: "🕐 Boutique fermée",
        buttons: [
          { id: "view_catalogue", title: "Voir les articles 🛍️" },
          { id: "leave_message", title: "Laisser un message 📝" },
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
        (opts.pendingDeposit > 0 ? `💳 En attente d’acompte : ${opts.pendingDeposit}\n` : "") +
        `⏳ Réservations en cours : ${opts.pendingReservations}\n` +
        `📦 Articles non vendus : ${opts.unsoldItems}\n` +
        `💰 Chiffre d’affaires : ${revenueFormatted} FCFA`
      );
    },

    itemCreated: (code: string, qty: number) =>
      `✅ *${code}* ajouté — ${qty} en stock`,

    itemCreatedWithPhoto: (code: string, qty: number) =>
      `✅ *${code}* ajouté — ${qty} en stock 📸`,

    itemAlreadyUsed: (code: string) =>
      `⚠️ Le code *${code}* est déjà utilisé dans ce live.\n\nChoisis un autre code (ex: ${code}B) ou libère le stock existant depuis le tableau de bord.`,

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
      `⚠️ Aucun prix configuré pour la catégorie *${letter}*.\n\nVa dans Paramètres → Prix pour l’ajouter.`,

    codeNotInCatalogue: (code: string) =>
      `⚠️ Le code *${code}* n’existe pas dans ton catalogue.\n\nCrée-le d’abord depuis le tableau de bord ou envoie-le avec une quantité (ex: *${code} 3*).`,

    codeAlreadyInStock: (code: string, availableQty: number) =>
      `⚠️ *${code}* a encore *${availableQty}* unité${availableQty > 1 ? "s" : ""} en stock.\n\nÉpuise d’abord ce stock ou choisis un autre code.`,

    liveCreateInstruction: () =>
      `ℹ️ En live, pas besoin d’écrire "ajout" ! Envoie juste le code (ex: *A12*) ou avec quantité (ex: *A12 x3*).`,

    sellerFallback: () =>
      `Je n’ai pas compris ce code 😅\n\nEnvoie juste le code (ex: *A12*) ou avec quantité (ex: *A12 x3*) pour créer l’article dans ce live.`,

    offLiveCreateInstruction: () =>
      `ℹ️ Hors live, utilise *ajout A12* ou *ajout A12 x3* pour créer un article.`,

    /** Confirmation ajout catalogue avec bouton Variantes */
    catalogueAddedInteractive: (code: string, qty: number): InteractiveMessage => ({
      body: `*${code}* ajouté au catalogue — ${qty} en stock`,
      interactive: {
        type: "buttons",
        header: "✅ Article ajouté",
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
        header: "✅ Article et photo 📸",
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
        `Réponds avec tes variantes dans ce format :`,
        `\`Label:stock, Label:stock\``,
        ``,
        `📝 Exemple :`,
        `\`${example}\``,
        ``,
        `Les stocks à 0 seront créés mais marqués épuisés.`,
      ].join("\n"),
      interactive: {
        type: "buttons",
        header: "⚡ Action requise",
        buttons: [
          { id: "cancel_variant_config", title: "Annuler config ❌" },
        ],
      } satisfies InteractivePayload,
    }),
  },
};
