import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SidebarProvider } from "~/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";

vi.mock("~/hooks/use-mobile", () => ({ useIsMobile: () => false }));
const signOut = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("next-auth/react", () => ({ signOut }));
vi.mock("./credits-alert", () => ({ CreditsAlert: () => null }));
vi.mock("~/trpc/react", () => ({ api: { auth: { changePassword: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } } } }));

it("ouvre les actions depuis la boutique et conserve le dialogue après la fermeture du menu", async () => {
  const user = userEvent.setup();
  render(<SidebarProvider><AppSidebar userName="compte@example.test" userEmail="compte@example.test" tenantName="Boutique Awa" canManageGrid showBranding={false} /></SidebarProvider>);
  expect(screen.queryByText("compte@example.test")).not.toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "Compte de Boutique Awa" });
  await user.click(trigger);
  expect(screen.getByRole("menuitem", { name: "Se déconnecter" })).toHaveClass("text-destructive");
  await user.click(screen.getByRole("menuitem", { name: "Changer le mot de passe" }));
  expect(await screen.findByRole("dialog", { name: "Changer mon mot de passe" })).toBeInTheDocument();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  await user.click(trigger);
  await user.click(screen.getByRole("menuitem", { name: "Se déconnecter" }));
  expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login", redirect: true });
});
