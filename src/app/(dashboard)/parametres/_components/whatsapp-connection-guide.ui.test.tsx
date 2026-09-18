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
  it("attend une sélection et une confirmation, puis conserve le choix au retour", () => {
    const connect = setup();
    const next = screen.getByRole("button", { name: "Continuer" });
    expect(next).toBeDisabled();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    fireEvent.click(screen.getByRole("radio", { name: "J’utilise WhatsApp Business" }));
    expect(next).toBeEnabled();
    expect(screen.getByRole("group", { name: "Quelle est votre situation ?" })).toBeVisible();
    expect(connect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "Je souhaite connecter un nouveau numéro" }));
    expect(screen.getByRole("radio", { name: "J’utilise WhatsApp Business" })).not.toBeChecked();
    fireEvent.click(next);
    expect(screen.getByText("Connectez votre nouveau numéro")).toBeVisible();
    expect(connect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Changer de choix" }));
    expect(screen.getByRole("radio", { name: "Je souhaite connecter un nouveau numéro" })).toBeChecked();
  });

  it("prépare le transfert personnel sans lancer Meta, puis ouvre la coexistence", () => {
    const connect = setup();
    fireEvent.click(screen.getByRole("radio", { name: "J’utilise WhatsApp personnel" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByText(/sans supprimer votre compte/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "J’ai installé WhatsApp Business" }));
    expect(connect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continuer chez Meta" })).toBeEnabled();
    expect(screen.getByText(/Vous faites la connexion sur votre téléphone/)).toBeVisible();
    expect(screen.getByText(/Vous pouvez refuser et continuer la connexion/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Continuer chez Meta" }));
    expect(connect).toHaveBeenCalledExactlyOnceWith("coexistence");
  });

  it("permet de choisir un numéro séparé après le parcours personnel", () => {
    const connect = setup();
    fireEvent.click(screen.getByRole("radio", { name: "J’utilise WhatsApp personnel" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    fireEvent.click(screen.getByRole("button", { name: "Utiliser un nouveau numéro" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuer chez Meta" }));
    expect(connect).toHaveBeenCalledExactlyOnceWith("cloud_api");
  });

  it("oriente les migrations vers l’aide sans lancer une nouvelle connexion", () => {
    const connect = setup();
    fireEvent.click(screen.getByRole("radio", { name: "Mon numéro est connecté à un autre logiciel" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByRole("link", { name: "Contacter l’assistance" }).getAttribute("href")).toBe("/aide");
    expect(screen.queryByRole("button", { name: "Continuer chez Meta" })).toBeNull();
    expect(connect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Changer de choix" }));
    expect(screen.getByRole("radio", { name: "J’utilise WhatsApp personnel" })).toBeTruthy();
  });

  it("bloque les changements de situation pendant une connexion", () => {
    setup(true);
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toBeDisabled();
    }
    for (const button of screen.getAllByRole("button")) {
      expect(button.hasAttribute("disabled")).toBe(true);
    }
  });
});
