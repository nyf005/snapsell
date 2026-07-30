import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// Mock next dependencies
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/dashboard/orders",
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    prefetch?: boolean;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock DashboardHeader
vi.mock("~/app/(dashboard)/_components/dashboard-header", () => ({
  DashboardHeader: () => <div data-testid="dashboard-header" />,
}));

/**
 * `proofs` et les champs d'adresse détaillés font partie de la sortie depuis que la
 * commande porte ses preuves — `ORDER_QUERY_INCLUDE` ne sélectionnait d'ailleurs
 * pas ces adresses, qui valaient donc toujours `null`.
 */
const mockApprove = vi.hoisted(() => vi.fn());
const mockReject = vi.hoisted(() => vi.fn());
const mockUpdateStatus = vi.hoisted(() => vi.fn());

const EMPTY_DETAIL = {
  depositExpiresAt: null,
  quantity: 1,
  variantLabel: null,
  deliveryAddress: null,
  deliveryAddressCity: null,
  deliveryAddressCommune: null,
  deliveryAddressZone: null,
  deliveryAddressDetails: null,
  updatedAt: new Date("2025-01-15T10:00:00Z"),
  reservationId: "res-1",
  proofs: [],
};

const ORDERS = [
  {
    ...EMPTY_DETAIL,
    id: "order-1",
    orderNumber: "CMD-2025-001",
    liveItemCode: "A1",
    clientPhone: "+225 ** 03 04",
    status: "confirmed",
    depositStatus: null,
    createdAt: new Date("2025-01-15T10:00:00Z"),
  },
  {
    // Livrée **et** acompte validé : le repère vers la preuve doit s'afficher.
    // Il était conditionné à `confirmed_pending_deposit` seul, donc absent ici.
    ...EMPTY_DETAIL,
    id: "order-2",
    orderNumber: "CMD-2025-002",
    liveItemCode: "B2",
    clientPhone: "+225 ** 07 08",
    status: "delivered",
    depositStatus: "deposit_approved",
    deliveryAddressCommune: "Cocody",
    deliveryAddressCity: "Abidjan",
    createdAt: new Date("2025-01-16T14:00:00Z"),
    proofs: [
      {
        id: "proof-2",
        kind: "image" as const,
        status: "approved",
        text: null,
        createdAt: new Date("2025-01-16T12:00:00Z"),
        reviewedAt: new Date("2025-01-16T13:00:00Z"),
      },
    ],
  },
  {
    ...EMPTY_DETAIL,
    id: "order-3",
    orderNumber: "CMD-2025-003",
    liveItemCode: null,
    clientPhone: "+225 ** 11 12",
    status: "cancelled",
    depositStatus: null,
    createdAt: new Date("2025-01-17T09:00:00Z"),
  },
  {
    // Acompte encore à vérifier : c'est la seule qui doit offrir la décision.
    ...EMPTY_DETAIL,
    id: "order-4",
    orderNumber: "CMD-2025-004",
    liveItemCode: "C3",
    clientPhone: "+225 ** 15 16",
    status: "confirmed_pending_deposit",
    depositStatus: "deposit_pending",
    createdAt: new Date("2025-01-18T09:00:00Z"),
    proofs: [
      {
        id: "proof-4",
        kind: "image" as const,
        status: "pending",
        text: null,
        createdAt: new Date("2025-01-18T08:00:00Z"),
        reviewedAt: null,
      },
    ],
  },
];

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      orders: {
        list: { invalidate: vi.fn() },
        getById: { invalidate: vi.fn() },
        exportCsv: { fetch: vi.fn() },
      },
      // Décider depuis le panneau change aussi le `depositStatus` de la commande :
      // les quatre lectures concernées sont invalidées.
      proofs: {
        listPending: { invalidate: vi.fn() },
        pendingCount: { invalidate: vi.fn() },
      },
    }),
    orders: {
      list: {
        useQuery: () => ({ data: { items: ORDERS, nextCursor: null }, isLoading: false }),
      },
      // Le panneau de détail interroge `getById`, endpoint qui existait depuis la
      // story 5.2 sans qu'aucune interface ne l'appelle.
      getById: {
        useQuery: ({ orderId }: { orderId: string }) => ({
          data: ORDERS.find((o) => o.id === orderId) ?? null,
          isLoading: false,
        }),
      },
      updateStatus: {
        useMutation: () => ({
          mutate: mockUpdateStatus,
          isPending: false,
          isError: false,
          error: null,
          reset: vi.fn(),
        }),
      },
    },
    proofs: {
      pendingCount: {
        useQuery: () => ({ data: 2 }),
      },
      // Le panneau décide désormais sur place : la preuve était visible depuis la
      // commande sans qu'on puisse agir, ce qui rétablissait l'aller-retour à l'envers.
      approve: {
        useMutation: () => ({ mutate: mockApprove, isPending: false, error: null }),
      },
      reject: {
        useMutation: () => ({ mutate: mockReject, isPending: false, error: null }),
      },
      listPending: { invalidate: vi.fn() },
    },
  },
}));

import { OrdersListContent } from "./orders-list-content";

describe("OrdersListContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the page header", () => {
    render(<OrdersListContent />);
    expect(
      screen.getByRole("heading", { name: "Commandes" }),
    ).toBeInTheDocument();
  });

  // DataList rend deux compositions complètes (tableau ≥ md, cartes en dessous) :
  // chaque valeur apparaît deux fois dans le DOM, une seule étant visible.
  it("renders all orders in the table", async () => {
    render(<OrdersListContent />);
    expect((await screen.findAllByText("CMD-2025-001")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("CMD-2025-002").length).toBeGreaterThan(0);
    expect(screen.getAllByText("CMD-2025-003").length).toBeGreaterThan(0);
  });

  // Régression : l'onglet « À préparer » affichait des lignes marquées « Confirmée ».
  it("un onglet d’état porte le même mot que le badge correspondant", async () => {
    render(<OrdersListContent />);
    await screen.findAllByText("CMD-2025-001");

    // « Confirmée » existe comme onglet ET comme badge : même mot des deux côtés.
    expect(screen.getAllByText("Confirmée").length).toBeGreaterThan(1);
    // Les anciens libellés divergents ont disparu.
    expect(screen.queryByText("À préparer")).not.toBeInTheDocument();
    expect(screen.queryByText("Prépa")).not.toBeInTheDocument();
    // La seule vue transversale reste, sans équivalent en badge.
    expect(screen.getByText("À traiter")).toBeInTheDocument();
  });

  it("expose chaque commande dans la composition mobile", async () => {
    render(<OrdersListContent />);
    const list = await screen.findByRole("list", { name: "Liste des commandes" });
    // Dérivé du jeu d'essai : ajouter une commande ne doit pas casser ce test.
    expect(within(list).getAllByRole("listitem")).toHaveLength(ORDERS.length);
  });

  it("displays status badges for each order", async () => {
    render(<OrdersListContent />);
    expect((await screen.findAllByText("Confirmée")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Livrée").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Annulée").length).toBeGreaterThan(0);
  });

  it("shows pending proofs link when proofs exist", () => {
    render(<OrdersListContent />);
    expect(
      screen.getByText(/2 preuves à valider/),
    ).toBeInTheDocument();
  });
});

/**
 * La preuve se consulte depuis la commande.
 *
 * Vérifier un acompte imposait un aller-retour vers l'écran des preuves pour y
 * lire le numéro de commande — et cet aller-retour n'était possible que tant que
 * la preuve était en attente, `proofs.listPending` étant le seul listing du
 * produit. Une fois validée, la preuve devenait introuvable.
 */
describe("OrdersListContent — la preuve depuis la commande", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("propose de voir la preuve dès qu'un acompte existe, même sur une commande livrée", async () => {
    render(<OrdersListContent />);

    const triggers = await screen.findAllByRole("button", { name: /voir la preuve/i });
    expect(triggers.length).toBeGreaterThan(0);
  });

  it("n'offre rien sur une commande sans acompte", () => {
    render(<OrdersListContent />);

    // `DataList` rend chaque ligne deux fois — tableau et carte mobile — d'où le
    // facteur 2. Le compte est dérivé du jeu d'essai plutôt qu'écrit en dur.
    const withDeposit = ORDERS.filter((o) => o.depositStatus).length;
    expect(screen.getAllByRole("button", { name: /voir la preuve/i })).toHaveLength(
      withDeposit * 2,
    );
    expect(withDeposit).toBeLessThan(ORDERS.length);
  });

  it("ouvre le détail de la commande depuis son numéro", async () => {
    const user = userEvent.setup();
    render(<OrdersListContent />);

    await user.click((await screen.findAllByRole("button", { name: "CMD-2025-002" }))[0]!);

    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("Commande CMD-2025-002")).toBeInTheDocument();
    // L'adresse structurée : absente du `select` avant, donc toujours nulle.
    expect(within(panel).getByText("Cocody, Abidjan")).toBeInTheDocument();
  });

  /**
   * Le panneau montrait la preuve sans permettre d'agir : on ouvrait une commande
   * en attente d'acompte, on voyait la pièce, et il fallait repartir sur l'écran
   * des preuves pour la retrouver. L'aller-retour de départ, à l'envers.
   */
  it("permet de valider l'acompte depuis le panneau", async () => {
    const user = userEvent.setup();
    render(<OrdersListContent />);

    await user.click((await screen.findAllByRole("button", { name: "CMD-2025-004" }))[0]!);
    const panel = await screen.findByRole("dialog");
    await user.click(
      within(panel).getByRole("button", { name: /Valider la preuve de la commande CMD-2025-004/ }),
    );

    expect(mockApprove).toHaveBeenCalledWith({ proofId: "proof-4" });
  });

  it("demande confirmation avant de refuser", async () => {
    const user = userEvent.setup();
    render(<OrdersListContent />);

    await user.click((await screen.findAllByRole("button", { name: "CMD-2025-004" }))[0]!);
    const panel = await screen.findByRole("dialog");
    await user.click(
      within(panel).getByRole("button", { name: /Refuser la preuve de la commande CMD-2025-004/ }),
    );

    // Rien n'est envoyé avant la confirmation.
    expect(mockReject).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Refuser la preuve" }));
    expect(mockReject).toHaveBeenCalledWith({ proofId: "proof-4" });
  });

  /** `approve` et `reject` refuseraient une preuve déjà traitée. */
  it("n'offre pas de décision sur une preuve déjà validée", async () => {
    const user = userEvent.setup();
    render(<OrdersListContent />);

    await user.click((await screen.findAllByRole("button", { name: "CMD-2025-002" }))[0]!);
    const panel = await screen.findByRole("dialog");

    expect(
      within(panel).queryByRole("button", { name: /Valider la preuve/ }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole("button", { name: /Refuser la preuve/ }),
    ).not.toBeInTheDocument();
  });

  it("permet de faire avancer la commande depuis le panneau", async () => {
    const user = userEvent.setup();
    render(<OrdersListContent />);

    await user.click((await screen.findAllByRole("button", { name: "CMD-2025-001" }))[0]!);
    const panel = await screen.findByRole("dialog");

    await user.click(
      within(panel).getByRole("combobox", {
        name: /Changer le statut de la commande CMD-2025-001/,
      }),
    );
    await user.click(screen.getByRole("option", { name: "En préparation" }));

    expect(mockUpdateStatus).toHaveBeenCalledWith({
      orderId: "order-1",
      status: "preparing",
    });
  });

  /**
   * Le panneau a la place de dire que la cliente sera prévenue ; le sélecteur en
   * colonne étroite, non. C'est ce qui distingue les deux, et non un doublon.
   */
  it("annonce dans le panneau que la cliente sera prévenue", async () => {
    const user = userEvent.setup();
    render(<OrdersListContent />);

    await user.click((await screen.findAllByRole("button", { name: "CMD-2025-001" }))[0]!);
    const panel = await screen.findByRole("dialog");

    expect(within(panel).getByText(/prévient la cliente sur\s+WhatsApp/i)).toBeInTheDocument();
  });

  it("montre la preuve validée dans le panneau, et sa date de traitement", async () => {
    const user = userEvent.setup();
    render(<OrdersListContent />);

    await user.click(screen.getAllByRole("button", { name: /voir la preuve/i })[0]!);

    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("Validée")).toBeInTheDocument();
    expect(within(panel).getByText(/Traitée le/)).toBeInTheDocument();
    expect(
      within(panel).getByRole("img", { name: /Preuve de paiement pour la commande CMD-2025-002/ }),
    ).toHaveAttribute("src", "/api/proofs/proof-2/media");
  });
});

/**
 * Trois transitions envoient un message WhatsApp à la cliente : `in_delivery`,
 * `delivered` et `cancelled`. Le sélecteur ne le disait nulle part — on choisissait
 * « Annulée » dans une liste déroulante et un message d'annulation partait, sans
 * confirmation. Seule l'annulation en demande une : les deux autres sont la marche
 * normale, et confirmer chaque colis qui part transformerait l'après-live en
 * chapelet de dialogues.
 */
describe("OrdersListContent — l'annulation demande confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("n'annule pas avant confirmation, puis annule", async () => {
    const user = userEvent.setup();
    render(<OrdersListContent />);

    const selects = await screen.findAllByRole("combobox", {
      name: /Changer le statut de la commande CMD-2025-001/,
    });
    await user.click(selects[0]!);
    await user.click(screen.getByRole("option", { name: "Annulée" }));

    expect(mockUpdateStatus).not.toHaveBeenCalled();
    expect(screen.getByText(/sera marquée comme annulée/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Annuler la commande" }));
    expect(mockUpdateStatus).toHaveBeenCalledWith({
      orderId: "order-1",
      status: "cancelled",
    });
  });

  it("renonce sans rien envoyer", async () => {
    const user = userEvent.setup();
    render(<OrdersListContent />);

    const selects = await screen.findAllByRole("combobox", {
      name: /Changer le statut de la commande CMD-2025-001/,
    });
    await user.click(selects[0]!);
    await user.click(screen.getByRole("option", { name: "Annulée" }));
    await user.click(screen.getByRole("button", { name: "Ne pas annuler" }));

    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  /** Les transitions non destructives restent immédiates. */
  it("passe en préparation sans confirmation", async () => {
    const user = userEvent.setup();
    render(<OrdersListContent />);

    const selects = await screen.findAllByRole("combobox", {
      name: /Changer le statut de la commande CMD-2025-001/,
    });
    await user.click(selects[0]!);
    await user.click(screen.getByRole("option", { name: "En préparation" }));

    expect(mockUpdateStatus).toHaveBeenCalledWith({
      orderId: "order-1",
      status: "preparing",
    });
  });
});
