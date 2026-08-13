import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/ops/whatsapp",
}));

import { OpsNav } from "./ops-nav";

describe("OpsNav", () => {
  it("identifie le compte support et rend la déconnexion explicite", () => {
    render(
      <OpsNav
        user={{ name: "Support SnapSell", email: "support@example.com" }}
      />,
    );

    expect(screen.getByText("Support SnapSell")).toBeVisible();
    expect(screen.getByText("support@example.com")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Se déconnecter" }),
    ).toHaveAttribute("href", "/logout");
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("utilise un libellé compréhensible quand le compte n'a pas de nom", () => {
    render(<OpsNav user={{ email: "ops@example.com" }} />);

    expect(screen.getByText("Compte support")).toBeVisible();
  });
});
