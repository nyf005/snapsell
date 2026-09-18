import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WhatsAppConnectionHelp } from "./whatsapp-connection-help";

afterEach(cleanup);

it("affiche un problème à la fois et permet de revenir ou fermer", () => {
  render(<WhatsAppConnectionHelp />);
  expect(screen.queryByText(/Votre prochaine étape/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Un problème avec Meta ?" }));
  expect(screen.queryByText(/utilisez-le avec un compte/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Quel portefeuille business choisir ?" }));
  expect(screen.getByText(/utilisez-le avec un compte/)).toBeInTheDocument();
  expect(screen.queryByText("Meta indique une limite de création")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Autre problème" }));
  fireEvent.click(screen.getByRole("button", { name: "Meta indique une limite de création" }));
  expect(screen.getByText(/attendez sa confirmation/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
  expect(screen.queryByText(/attendez sa confirmation/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Un problème avec Meta ?" }));
  expect(screen.getByText("Qu’est-ce qui vous bloque ?")).toBeInTheDocument();
});
