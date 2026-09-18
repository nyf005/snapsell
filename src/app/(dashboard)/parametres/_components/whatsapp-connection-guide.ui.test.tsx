import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WhatsAppConnectionGuide } from "./whatsapp-connection-guide";

afterEach(cleanup);

function setup(busy = false) {
  const onConnect = vi.fn();
  render(<WhatsAppConnectionGuide isConnected={false} busy={busy} actionLabel={() => "Continuer chez Meta"} onConnect={onConnect} />);
  return onConnect;
}

describe("préparation WhatsApp", () => {
  it("prépare le transfert personnel sans lancer Meta, puis ouvre la coexistence", () => {
    const connect = setup();
    fireEvent.click(screen.getByRole("button", { name: "J’utilise WhatsApp personnel" }));
    expect(screen.getByText(/sans supprimer votre compte/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "J’ai installé WhatsApp Business" }));
    expect(connect).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Continuer chez Meta" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tout est prêt, continuer" }));
    expect(connect).not.toHaveBeenCalled();
    expect(screen.getByText(/Lorsque Meta affiche le QR code/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continuer chez Meta" }));
    expect(connect).toHaveBeenCalledExactlyOnceWith("coexistence");
  });

  it("permet de choisir un numéro séparé après le parcours personnel", () => {
    const connect = setup();
    fireEvent.click(screen.getByRole("button", { name: "J’utilise WhatsApp personnel" }));
    fireEvent.click(screen.getByRole("button", { name: "Utiliser un nouveau numéro" }));
    fireEvent.click(screen.getByRole("button", { name: "Tout est prêt, continuer" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuer chez Meta" }));
    expect(connect).toHaveBeenCalledExactlyOnceWith("cloud_api");
  });

  it("oriente les migrations vers l’aide sans lancer une nouvelle connexion", () => {
    const connect = setup();
    fireEvent.click(screen.getByRole("button", { name: "Mon numéro est connecté à un autre logiciel" }));
    expect(screen.getByRole("link", { name: "Contacter l’assistance" }).getAttribute("href")).toBe("/aide");
    expect(screen.queryByRole("button", { name: "Continuer chez Meta" })).toBeNull();
    expect(connect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Changer de choix" }));
    expect(screen.getByRole("button", { name: "J’utilise WhatsApp personnel" })).toBeTruthy();
  });

  it("bloque les changements de situation pendant une connexion", () => {
    setup(true);
    for (const button of screen.getAllByRole("button")) {
      expect(button.hasAttribute("disabled")).toBe(true);
    }
  });
});
