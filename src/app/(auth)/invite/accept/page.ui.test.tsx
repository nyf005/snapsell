import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InviteAcceptPage from "./page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(), mutate: vi.fn(), signOut: vi.fn(),
  session: null as null | { user: { email: string } },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams({ token: "invitation-token" }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: mocks.session, status: mocks.session ? "authenticated" : "unauthenticated" }),
  signIn: vi.fn(), signOut: mocks.signOut,
}));
vi.mock("~/trpc/react", () => ({ api: { invitations: {
  getInvitationByToken: { useQuery: () => ({ data: { email: "recipient@example.com", tenantName: "Boutique", hasExistingAccount: true }, isLoading: false }) },
  acceptInvitation: { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) },
} } }));

describe("acceptation par un compte existant", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.session = null; });
  const loginHref = "/login?callbackUrl=" + encodeURIComponent("/invite/accept?token=invitation-token");

  it("conserve le lien pendant la connexion sans accepter anonymement", () => {
    render(<InviteAcceptPage />);
    fireEvent.click(screen.getByRole("button", { name: "Se connecter avec le compte invité" }));
    expect(mocks.push).toHaveBeenCalledWith(loginHref);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("demande de changer de compte sans accepter pour le destinataire", () => {
    mocks.session = { user: { email: "issuer@example.com" } };
    render(<InviteAcceptPage />);
    fireEvent.click(screen.getByRole("button", { name: "Se connecter avec le compte invité" }));
    expect(mocks.signOut).toHaveBeenCalledWith({ callbackUrl: loginHref });
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("permet au destinataire connecté de confirmer explicitement", () => {
    mocks.session = { user: { email: "recipient@example.com" } };
    render(<InviteAcceptPage />);
    fireEvent.click(screen.getByRole("button", { name: "Rejoindre l'équipe" }));
    expect(mocks.mutate).toHaveBeenCalledWith({ token: "invitation-token" });
  });
});
