import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// Mock DashboardHeader
vi.mock("~/app/(dashboard)/_components/dashboard-header", () => ({
  DashboardHeader: () => <div data-testid="dashboard-header" />,
}));

const mockApprove = vi.fn();
const mockReject = vi.fn();
const mockBulkApprove = vi.fn();
const mockBulkReject = vi.fn();

/**
 * `kind` remplace `mediaStorageKey` dans la sortie : la clé R2 est un chemin de
 * stockage interne, et l'image se lit par `/api/proofs/[proofId]/media`.
 *
 * `status` devient nécessaire depuis qu'on peut consulter les preuves traitées —
 * la requête filtrait « en attente » en dur, et valider/refuser ne s'offre donc
 * plus que sur une preuve encore en attente.
 */
/** Dernier `status` demandé à `listPending`, pour vérifier le filtre. */
const lastQuery = vi.hoisted(() => ({ status: undefined as string | undefined }));

/** Cache par statut : garde une identité de tableau stable entre les rendus. */
const itemsByStatus = vi.hoisted(() => ({}) as Record<string, unknown[]>);

const PROOFS = [
  {
    id: "proof-1",
    orderNumber: "CMD-001",
    clientPhone: "+225 01 01 02 03 04",
    status: "pending",
    kind: "image" as const,
    textPayload: null,
    createdAt: new Date("2025-01-15T10:00:00Z"),
    reviewedAt: null,
  },
  {
    id: "proof-2",
    orderNumber: "CMD-002",
    clientPhone: "+225 05 06 07 08 09",
    status: "pending",
    kind: "text" as const,
    textPayload: "Paiement effectué",
    createdAt: new Date("2025-01-16T14:00:00Z"),
    reviewedAt: null,
  },
];

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      proofs: { listPending: { invalidate: vi.fn() } },
    }),
    proofs: {
      listPending: {
        /**
         * Le tableau est mémoïsé par statut. Sans ça, chaque rendu en renvoyait un
         * nouveau, et l'`useEffect` du composant — qui dépend de `data.items` —
         * se redéclenchait indéfiniment. react-query garantit cette stabilité de
         * référence ; un mock naïf, non.
         */
        useQuery: (input: { status?: string }) => {
          const status = input?.status ?? "pending";
          lastQuery.status = status;
          itemsByStatus[status] ??=
            status === "all" ? PROOFS : PROOFS.filter((p) => p.status === status);
          return {
            data: { items: itemsByStatus[status], nextCursor: null },
            isLoading: false,
          };
        },
      },
      approve: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: mockApprove.mockImplementation(() => opts.onSuccess?.()),
          isPending: false,
          isError: false,
          error: null,
        }),
      },
      reject: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: mockReject.mockImplementation(() => opts.onSuccess?.()),
          isPending: false,
          isError: false,
          error: null,
        }),
      },
      bulkApprove: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: mockBulkApprove.mockImplementation(() => opts.onSuccess?.()),
          isPending: false,
          isError: false,
          error: null,
        }),
      },
      bulkReject: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: mockBulkReject.mockImplementation(() => opts.onSuccess?.()),
          isPending: false,
          isError: false,
          error: null,
        }),
      },
    },
  },
}));

import { ProofsListContent } from "./proofs-list-content";

describe("ProofsListContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the page title", () => {
    render(<ProofsListContent />);
    expect(
      screen.getByRole("heading", { name: "Preuves de paiement" }),
    ).toBeInTheDocument();
  });

  it("renders proof entries with order numbers", () => {
    render(<ProofsListContent />);
    // DataList rend deux compositions : chaque valeur apparaît deux fois dans le DOM.
    expect(screen.getAllByText("CMD-001").length).toBeGreaterThan(0);
    expect(screen.getAllByText("CMD-002").length).toBeGreaterThan(0);
  });

  // Régression : la case vivait dans l'en-tête du tableau et avait été perdue
  // à la migration DataList, sans qu'aucun test ne s'en aperçoive.
  it("permet de tout sélectionner d’un clic", () => {
    render(<ProofsListContent />);
    expect(
      screen.getByRole("button", { name: /Tout sélectionner/i }),
    ).toBeInTheDocument();
  });

  it("expose chaque preuve dans la composition mobile", () => {
    render(<ProofsListContent />);
    const list = screen.getByRole("list", {
      name: "Preuves de paiement en attente de validation",
    });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  });

  it("calls approve mutation when Valider is clicked", async () => {
    const user = userEvent.setup();
    render(<ProofsListContent />);

    const validateButtons = screen.getAllByRole("button", {
      name: /Valider la preuve pour la commande/,
    });
    await user.click(validateButtons[0]!);

    expect(mockApprove).toHaveBeenCalledWith({ proofId: "proof-1" });
  });

  it("calls reject mutation when refuse button is clicked", async () => {
    const user = userEvent.setup();
    render(<ProofsListContent />);

    const rejectButtons = screen.getAllByRole("button", {
      name: /Refuser la preuve pour la commande/,
    });
    await user.click(rejectButtons[0]!);
    await user.click(screen.getByRole("button", { name: "Refuser la preuve" }));

    expect(mockReject).toHaveBeenCalledWith({ proofId: "proof-1" });
  });
});

/**
 * Les preuves traitées étaient inatteignables : la requête filtrait « en attente »
 * en dur, et c'était le seul listing de preuves du produit. Impossible de dire
 * « qu'ai-je refusé cette semaine », ni de revoir ce qu'on avait validé.
 */
describe("ProofsListContent — consulter les preuves traitées", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastQuery.status = undefined;
  });

  it("s'ouvre sur la file de travail", () => {
    render(<ProofsListContent />);

    expect(screen.getByRole("tab", { name: "À vérifier" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(lastQuery.status).toBe("pending");
  });

  it("offre les quatre vues", () => {
    render(<ProofsListContent />);

    for (const label of ["À vérifier", "Validées", "Refusées", "Toutes"]) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    }
  });

  it("demande au serveur le statut de la vue choisie", async () => {
    const user = userEvent.setup();
    render(<ProofsListContent />);

    await user.click(screen.getByRole("tab", { name: "Refusées" }));

    expect(lastQuery.status).toBe("rejected");
  });

  /**
   * `approve` et `reject` refuseraient une preuve déjà traitée : proposer un bouton
   * qui échoue est pire que ne rien proposer.
   */
  it("n'offre pas valider/refuser sur une preuve déjà traitée", async () => {
    const user = userEvent.setup();
    render(<ProofsListContent />);

    await user.click(screen.getByRole("tab", { name: "Validées" }));

    expect(
      screen.queryAllByRole("button", { name: /Valider la preuve pour la commande/ }),
    ).toHaveLength(0);
    expect(
      screen.queryAllByRole("button", { name: /Refuser la preuve pour la commande/ }),
    ).toHaveLength(0);
  });
});
