/**
 * Le rôle d'un membre invité doit être choisissable.
 *
 * `createInvitation` écrivait `role: "AGENT"` en dur et le formulaire affichait,
 * sous l'intitulé « Rôle attribué », une carte décorative non interactive portant
 * « Agent » et la mention « Accès support standard (scope story 1-7) ». Il n'y
 * avait donc aucun moyen d'inviter un Manager, et VENDEUR n'était attribuable par
 * aucun chemin de l'application.
 *
 * Ces tests tiennent sur le contrat visible : un contrôle de formulaire nommé
 * « Rôle attribué », une option par rôle assignable, et le rôle retenu transmis
 * à la mutation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/parametres/team",
}));

vi.mock("~/app/(dashboard)/_components/dashboard-header", () => ({
  DashboardHeader: () => <div data-testid="dashboard-header" />,
}));

vi.mock("~/app/(dashboard)/_components/task-page-header", () => ({
  TaskPageHeader: ({ actions }: { actions?: React.ReactNode }) => <div>{actions}</div>,
}));

const createInvitationMutate = vi.hoisted(() => vi.fn());

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      invitations: { listInvitations: { invalidate: vi.fn() } },
      team: { listMembers: { invalidate: vi.fn() } },
    }),
    invitations: {
      createInvitation: {
        useMutation: () => ({
          mutate: createInvitationMutate,
          isPending: false,
          error: null,
          reset: vi.fn(),
        }),
      },
      listInvitations: { useQuery: () => ({ data: [], isLoading: false }) },
    },
    team: {
      listMembers: {
        useQuery: () => ({
          data: [
            {
              id: "u-1",
              email: "patronne@example.com",
              name: "Patronne",
              role: "OWNER",
              createdAt: new Date("2026-01-01"),
              updatedAt: new Date("2026-01-01"),
            },
            {
              id: "u-2",
              email: "vente@example.com",
              name: "Awa Vente",
              role: "VENDEUR",
              createdAt: new Date("2026-01-02"),
              updatedAt: new Date("2026-01-02"),
            },
          ],
          isLoading: false,
        }),
      },
      updateRole: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
      },
      removeMember: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
      },
    },
  },
}));

import { TeamContent } from "./team-content";

/** Ouvre la boîte de dialogue d'invitation et rend son formulaire. */
async function openInviteDialog() {
  const user = userEvent.setup();
  render(<TeamContent />);
  await user.click(screen.getByRole("button", { name: /inviter/i }));
  return user;
}

describe("TeamContent — le rôle est choisissable à l'invitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("expose un contrôle « Rôle attribué », et non un texte figé", async () => {
    await openInviteDialog();

    const control = screen.getByRole("combobox", { name: /rôle attribué/i });
    expect(control).toBeEnabled();
  });

  it("propose Manager, Vente et Agent — et jamais Propriétaire", async () => {
    const user = await openInviteDialog();

    await user.click(screen.getByRole("combobox", { name: /rôle attribué/i }));
    const options = screen.getAllByRole("option").map((o) => o.textContent);

    expect(options).toEqual(["Manager", "Vente", "Agent"]);
    expect(options).not.toContain("Propriétaire");
  });

  it("transmet le rôle retenu à createInvitation", async () => {
    const user = await openInviteDialog();

    await user.type(screen.getByLabelText(/adresse email/i), "nouvelle@example.com");
    await user.click(screen.getByRole("combobox", { name: /rôle attribué/i }));
    await user.click(screen.getByRole("option", { name: "Manager" }));
    await user.click(screen.getByRole("button", { name: /envoyer l'invitation/i }));

    expect(createInvitationMutate).toHaveBeenCalledWith({
      email: "nouvelle@example.com",
      role: "MANAGER",
    });
  });

  it("retombe sur Agent quand on ne touche pas au sélecteur", async () => {
    const user = await openInviteDialog();

    await user.type(screen.getByLabelText(/adresse email/i), "nouvelle@example.com");
    await user.click(screen.getByRole("button", { name: /envoyer l'invitation/i }));

    expect(createInvitationMutate).toHaveBeenCalledWith({
      email: "nouvelle@example.com",
      role: "AGENT",
    });
  });

  it("décrit à l'écran ce que le rôle retenu pourra faire", async () => {
    const user = await openInviteDialog();

    await user.click(screen.getByRole("combobox", { name: /rôle attribué/i }));
    await user.click(screen.getByRole("option", { name: "Vente" }));

    // `roleDescription("VENDEUR")`, et non la mention « scope story 1-7 ».
    expect(screen.getByText(/pilote les ventes pendant le live/i)).toBeInTheDocument();
    expect(screen.queryByText(/scope story/i)).not.toBeInTheDocument();
  });
});

describe("TeamContent — les libellés de rôle viennent de roleLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Le `formatRole` local disait « Admin » là où le vocabulaire canonique dit
   * « Propriétaire », et n'avait pas de cas VENDEUR : le rôle Vente s'affichait
   * `VENDEUR`, l'énumération brute que `terms.ts` doit intercepter.
   */
  // `DataList` rend chaque membre deux fois — une ligne de tableau et une carte
  // mobile — d'où les `getAllByText`.
  it("affiche Propriétaire et Vente, jamais Admin ni l'énumération brute", async () => {
    render(<TeamContent />);

    expect(await screen.findAllByText("Propriétaire")).not.toHaveLength(0);
    expect(screen.getAllByText("Vente")).not.toHaveLength(0);
    expect(screen.queryAllByText("Admin")).toHaveLength(0);
    expect(screen.queryAllByText("VENDEUR")).toHaveLength(0);
  });
});
