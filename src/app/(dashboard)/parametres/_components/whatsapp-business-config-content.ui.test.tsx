/**
 * Tests du profil WhatsApp Business.
 *
 * Deux réglages qui ne dépendent pas de nous mais de Meta : le catalogue et le
 * modèle de message. Trois pièges, tous silencieux :
 *
 * 1. Sans connexion Meta, il n'y a rien à choisir. L'écran doit le dire, pas
 *    présenter un menu vide qu'on croit cassé.
 * 2. Seuls les modèles *approuvés* par Meta peuvent être envoyés. En proposer un
 *    en attente, c'est un envoi refusé au moment où on en a besoin.
 * 3. Le modèle déjà retenu doit revenir sélectionné, sinon on croit n'en avoir
 *    aucun et on en choisit un autre.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockSelectCatalog = vi.hoisted(() => vi.fn());
const mockSelectTemplate = vi.hoisted(() => vi.fn());
const mockRefetchCatalogs = vi.hoisted(() => vi.fn());
const mockRefetchTemplates = vi.hoisted(() => vi.fn());

type Template = {
  name: string;
  language: string;
  category: string;
  status: string;
};

const state = vi.hoisted(() => ({
  waConfig: {
    metaPhoneNumberId: "phone-1",
    metaWabaId: "waba-1",
    hasAccessToken: true,
  } as Record<string, unknown> | undefined,
  businessConfig: {} as Record<string, unknown> | undefined,
  catalogs: [] as { id: string; name: string }[],
  catalogsEnabled: false,
  templates: [] as Template[],
  selectedTemplate: null as Template | null,
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      settings: {
        getBusinessConfig: { invalidate: vi.fn() },
        fetchWhatsAppTemplates: { invalidate: vi.fn() },
      },
    }),
    settings: {
      getBusinessConfig: { useQuery: () => ({ data: state.businessConfig }) },
      getWhatsAppConfig: { useQuery: () => ({ data: state.waConfig }) },
      fetchMetaCatalogs: {
        useQuery: (_input: unknown, opts?: { enabled?: boolean }) => {
          state.catalogsEnabled = opts?.enabled ?? false;
          return {
            data: state.catalogs,
            isLoading: false,
            refetch: mockRefetchCatalogs,
          };
        },
      },
      fetchWhatsAppTemplates: {
        useQuery: () => ({
          data: {
            templates: state.templates,
            selectedTemplate: state.selectedTemplate,
          },
          isLoading: false,
          isFetching: false,
          refetch: mockRefetchTemplates,
        }),
      },
      selectMetaCatalog: {
        useMutation: () => ({ mutate: mockSelectCatalog, isPending: false }),
      },
      selectWhatsAppTemplate: {
        useMutation: () => ({ mutate: mockSelectTemplate, isPending: false }),
      },
    },
  },
}));

import { WhatsAppAdvancedSections } from "./whatsapp-business-config-content";

function template(overrides: Partial<Template> = {}): Template {
  return {
    name: "rappel_commande",
    language: "fr",
    category: "UTILITY",
    status: "APPROVED",
    ...overrides,
  };
}

describe("WhatsAppAdvancedSections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.waConfig = {
      metaPhoneNumberId: "phone-1",
      metaWabaId: "waba-1",
      hasAccessToken: true,
    };
    state.businessConfig = {};
    state.catalogs = [];
    state.catalogsEnabled = false;
    state.templates = [];
    state.selectedTemplate = null;
  });

  describe("sans connexion Meta", () => {
    it.each([
      ["le numéro", { metaWabaId: "waba-1", hasAccessToken: true }],
      ["le WABA", { metaPhoneNumberId: "phone-1", hasAccessToken: true }],
      ["le jeton", { metaPhoneNumberId: "phone-1", metaWabaId: "waba-1" }],
    ])("explique quoi faire quand %s manque", (_name, config) => {
      state.waConfig = config;
      render(<WhatsAppAdvancedSections />);

      expect(screen.queryByLabelText("Catalogue")).not.toBeInTheDocument();
      expect(screen.getByText(/Connectez d'abord WhatsApp/)).toBeInTheDocument();
    });
  });

  describe("catalogue", () => {
    /**
     * L'appel à Meta est payant en latence et n'a de sens qu'à la demande : il
     * ne part pas au chargement de l'écran.
     */
    it("ne va chercher les catalogues que sur demande", async () => {
      const user = userEvent.setup();
      render(<WhatsAppAdvancedSections />);

      expect(state.catalogsEnabled).toBe(false);

      await user.click(screen.getByRole("button", { name: /Récupérer/ }));

      expect(state.catalogsEnabled).toBe(true);
    });

    /** Un menu vide sans explication se lit comme un écran cassé. */
    it("dit quoi faire tant qu'aucun catalogue n'a été récupéré", () => {
      render(<WhatsAppAdvancedSections />);

      expect(screen.getByLabelText("Catalogue")).toBeDisabled();
      expect(screen.getByText(/Récupérez d'abord les catalogues/)).toBeInTheDocument();
    });

    it("envoie le catalogue choisi avec son nom", async () => {
      const user = userEvent.setup();
      state.catalogs = [
        { id: "cat-1", name: "Boutique principale" },
        { id: "cat-2", name: "Déstockage" },
      ];
      render(<WhatsAppAdvancedSections />);

      await user.click(screen.getByLabelText("Catalogue"));
      await user.click(await screen.findByRole("option", { name: "Déstockage" }));
      await user.click(screen.getByRole("button", { name: "Utiliser ce catalogue" }));

      expect(mockSelectCatalog).toHaveBeenCalledWith({
        catalogId: "cat-2",
        catalogName: "Déstockage",
      });
    });
  });

  describe("modèles de message", () => {
    /**
     * Le point qui compte. Meta refuse l'envoi d'un modèle non approuvé — le
     * proposer dans la liste, c'est promettre un message qui ne partira pas.
     */
    it("ne propose que les modèles approuvés par Meta", async () => {
      const user = userEvent.setup();
      state.templates = [
        template({ name: "rappel_approuve", status: "APPROVED" }),
        template({ name: "brouillon_en_attente", status: "PENDING" }),
        template({ name: "modele_refuse", status: "REJECTED" }),
      ];
      render(<WhatsAppAdvancedSections />);

      await user.click(screen.getByLabelText("Template approuvé"));

      expect(
        await screen.findByRole("option", { name: /rappel_approuve/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: /brouillon_en_attente/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: /modele_refuse/ }),
      ).not.toBeInTheDocument();
    });

    it("laisse le menu inerte quand aucun modèle n'est approuvé", () => {
      state.templates = [template({ status: "PENDING" })];
      render(<WhatsAppAdvancedSections />);

      expect(screen.getByLabelText("Template approuvé")).toBeDisabled();
    });

    /** Sinon on croit n'avoir rien choisi, et on rechoisit par-dessus. */
    it("rappelle le modèle déjà retenu", () => {
      state.templates = [template({ name: "rappel_commande" })];
      state.selectedTemplate = template({ name: "rappel_commande" });
      render(<WhatsAppAdvancedSections />);

      expect(screen.getByLabelText("Template approuvé")).toHaveTextContent(
        /rappel_commande/,
      );
    });

    /**
     * Le nom seul ne suffit pas : Meta identifie un modèle par nom *et* langue,
     * et la catégorie décide de la facturation de la conversation.
     */
    it("envoie le nom, la langue et la catégorie", async () => {
      const user = userEvent.setup();
      state.templates = [
        template({ name: "rappel_commande", language: "fr", category: "UTILITY" }),
      ];
      render(<WhatsAppAdvancedSections />);

      await user.click(screen.getByLabelText("Template approuvé"));
      await user.click(await screen.findByRole("option", { name: /rappel_commande/ }));
      await user.click(screen.getByRole("button", { name: "Sélectionner" }));

      expect(mockSelectTemplate).toHaveBeenCalledWith({
        name: "rappel_commande",
        language: "fr",
        category: "UTILITY",
      });
    });
  });
});
