import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useUnsavedChanges } from "./use-unsaved-changes";
import { UnsavedChangesDialog } from "~/components/ui/unsaved-changes-dialog";
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
function Form() {
  const guard = useUnsavedChanges(true);
  return <><input aria-label="Nom" defaultValue="Article en cours" /><a href="/dashboard">Accueil</a><UnsavedChangesDialog {...guard} /></>;
}
describe("Protection des saisies", () => {
  beforeEach(() => push.mockClear());
  it("conserve le formulaire quand la personne décide de continuer", () => {
    render(<Form />);
    fireEvent.click(screen.getByText("Accueil"));
    expect(screen.getByRole("alertdialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Continuer à modifier" }));
    expect(screen.getByLabelText("Nom")).toHaveValue("Article en cours");
    expect(push).not.toHaveBeenCalled();
  });
  it("ne navigue qu’après abandon explicite", () => {
    render(<Form />);
    fireEvent.click(screen.getByText("Accueil"));
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Quitter sans enregistrer" }));
    expect(push).toHaveBeenCalledWith("/dashboard");
  });
});
