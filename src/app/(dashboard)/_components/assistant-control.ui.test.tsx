import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutate = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
  status: {
    enabled: false,
    state: "paused" as "paused" | "active" | "unavailable",
    connected: true,
    ready: true,
    blockers: [] as Array<"whatsapp" | "catalogue">,
    warnings: ["replies"] as Array<"delivery" | "replies" | "hours">,
    sellableItemCount: 2,
    updatedAt: null,
    updatedBy: null,
    activatedAt: null,
  },
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      assistant: { getStatus: { invalidate: vi.fn() } },
      onboarding: { getStatus: { invalidate: vi.fn() } },
    }),
    assistant: {
      getStatus: {
        useQuery: () => ({ data: state.status, isLoading: false }),
      },
      setEnabled: {
        useMutation: () => ({ mutate, isPending: false }),
      },
    },
  },
}));

import { AssistantControl } from "./assistant-control";

describe("AssistantControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.status = {
      enabled: false,
      state: "paused",
      connected: true,
      ready: true,
      blockers: [],
      warnings: ["replies"],
      sellableItemCount: 2,
      updatedAt: null,
      updatedBy: null,
      activatedAt: null,
    };
  });

  it("explique la pause sans confondre connexion et activation", () => {
    render(<AssistantControl />);

    expect(screen.getByText("en pause")).toBeVisible();
    expect(screen.getByText(/reçoit les messages, mais ne répond pas/i)).toBeVisible();
    expect(screen.getByRole("switch", { name: "Activer l’assistant" })).not.toBeChecked();
  });

  it("révèle les prérequis manquants au lieu de faire rebondir l’interrupteur", () => {
    state.status.ready = false;
    state.status.blockers = ["catalogue"];
    render(<AssistantControl />);

    fireEvent.click(screen.getByRole("switch", { name: "Activer l’assistant" }));

    expect(screen.getByText("Terminez ces étapes avant l’activation")).toBeVisible();
    expect(screen.getByRole("link", { name: /Ajoutez un article/i })).toHaveAttribute(
      "href",
      "/dashboard/catalogue",
    );
    expect(mutate).not.toHaveBeenCalled();
  });

  it("demande une confirmation explicite avant la première activation", () => {
    render(<AssistantControl />);

    fireEvent.click(screen.getByRole("switch", { name: "Activer l’assistant" }));
    expect(screen.getByText(/uniquement pour les articles enregistrés/i)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Activer l’assistant" }));

    expect(mutate).toHaveBeenCalledWith({ enabled: true });
  });

  it("met immédiatement en pause un assistant actif", () => {
    state.status.enabled = true;
    state.status.state = "active";
    render(<AssistantControl />);

    fireEvent.click(screen.getByRole("switch", { name: "Mettre l’assistant en pause" }));

    expect(mutate).toHaveBeenCalledWith({ enabled: false });
  });

  it("permet de couper un assistant devenu indisponible", () => {
    state.status.enabled = true;
    state.status.state = "unavailable";
    state.status.connected = false;
    render(<AssistantControl />);

    const control = screen.getByRole("switch", {
      name: "Mettre l’assistant en pause",
    });
    expect(control).toBeChecked();
    expect(control).toBeEnabled();

    fireEvent.click(control);
    expect(mutate).toHaveBeenCalledWith({ enabled: false });
  });
});
