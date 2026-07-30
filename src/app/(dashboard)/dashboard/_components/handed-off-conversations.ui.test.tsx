/**
 * Une conversation basculée vers une personne ne revenait jamais au robot —
 * `setHandedOff` n'était appelé qu'avec `true`. Ces tests tiennent le contrat
 * visible : la section n'apparaît que s'il y a du travail, le numéro est masqué,
 * et le bouton rend bien la main.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockHandBack = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
  conversations: [] as Array<{
    id: string;
    phone: string;
    phoneMasked: string;
    since: Date;
    expiresAt: Date;
    expired: boolean;
  }>,
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      conversations: { listHandedOff: { invalidate: vi.fn() } },
    }),
    conversations: {
      listHandedOff: {
        useQuery: () => ({ data: state.conversations, isLoading: false }),
      },
      handBackToBot: {
        useMutation: () => ({
          mutate: mockHandBack,
          isPending: false,
          isError: false,
          error: null,
        }),
      },
    },
  },
}));

import { HandedOffConversations } from "./handed-off-conversations";

describe("HandedOffConversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.conversations = [];
  });

  /** Elle ne doit pas prendre la place du travail du jour pour rien. */
  it("ne s'affiche pas quand il n'y a rien à reprendre", () => {
    const { container } = render(<HandedOffConversations />);
    expect(container).toBeEmptyDOMElement();
  });

  it("affiche le numéro masqué, jamais le numéro entier", () => {
    state.conversations = [
      {
        id: "cs-1",
        phone: "+2250701020304",
        phoneMasked: "***0304",
        since: new Date("2026-07-30T08:00:00Z"),
        expiresAt: new Date("2026-07-31T08:00:00Z"),
        expired: false,
      },
    ];
    render(<HandedOffConversations />);

    expect(screen.getByText("***0304")).toBeInTheDocument();
    expect(screen.queryByText("+2250701020304")).not.toBeInTheDocument();
  });

  it("rend la main à l'assistant sur le numéro réel", async () => {
    const user = userEvent.setup();
    state.conversations = [
      {
        id: "cs-1",
        phone: "+2250701020304",
        phoneMasked: "***0304",
        since: new Date("2026-07-30T08:00:00Z"),
        expiresAt: new Date("2026-07-31T08:00:00Z"),
        expired: false,
      },
    ];
    render(<HandedOffConversations />);

    await user.click(screen.getByRole("button", { name: /Rendre la conversation/ }));

    expect(mockHandBack).toHaveBeenCalledWith({ phone: "+2250701020304" });
  });

  /** Sinon on se demande pourquoi une ligne a disparu toute seule. */
  it("signale une reprise automatique imminente", () => {
    state.conversations = [
      {
        id: "cs-old",
        phone: "+2250701020304",
        phoneMasked: "***0304",
        since: new Date("2026-07-28T08:00:00Z"),
        expiresAt: new Date("2026-07-29T08:00:00Z"),
        expired: true,
      },
    ];
    render(<HandedOffConversations />);

    expect(screen.getByText(/Reprise automatique imminente/)).toBeInTheDocument();
  });
});
