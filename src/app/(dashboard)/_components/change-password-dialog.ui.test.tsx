import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mockChangePasswordMutate = vi.fn();
const mockSignOut = vi.fn();

vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    auth: {
      changePassword: {
        useMutation: () => ({
          mutate: mockChangePasswordMutate,
          isPending: false,
        }),
      },
    },
  },
}));

import { ChangePasswordDialog } from "./change-password-dialog";

function openDialog() {
  render(<ChangePasswordDialog email="awa@maboutique.ci" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Changer mon mot de passe" }),
  );
}

describe("ChangePasswordDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * ── UN FORMULAIRE DE MOT DE PASSE DOIT NOMMER LE COMPTE ────────────────────
   *
   * Chrome signalait « Password forms should have (optionally hidden) username
   * fields ». La remarque est juste, et l'enjeu dépasse l'avertissement : sans
   * identifiant, un gestionnaire de mots de passe enregistre un secret orphelin
   * qu'il ne saura pas reproposer à la bonne connexion. La vendeuse se retrouve
   * avec un mot de passe changé et un gestionnaire qui propose l'ancien.
   *
   * Le champ est visible à dessein : il dit aussi quel compte on modifie.
   */
  it("nomme le compte concerné", () => {
    openDialog();
    const compte = screen.getByLabelText("Compte") as HTMLInputElement;

    expect(compte.value).toBe("awa@maboutique.ci");
    expect(compte).toHaveAttribute("autocomplete", "username");
    // `readOnly` et non `disabled` : un champ désactivé n'est pas soumis et
    // reste invisible aux gestionnaires de mots de passe.
    expect(compte).toHaveAttribute("readonly");
    expect(compte).not.toBeDisabled();
  });

  /**
   * Condition exacte que Chrome contrôle : `input.form` est la propriété qu'il
   * consulte avant d'émettre son avertissement. La vérifier ici évite d'ouvrir
   * une page authentifiée pour constater sa disparition.
   */
  it("place les champs masqués et l'identifiant dans le même formulaire", () => {
    openDialog();

    const compte = screen.getByLabelText("Compte") as HTMLInputElement;
    const actuel = screen.getByLabelText("Mot de passe actuel") as HTMLInputElement;
    const nouveau = screen.getByLabelText("Nouveau mot de passe") as HTMLInputElement;

    expect(actuel.type).toBe("password");
    expect(nouveau.type).toBe("password");

    expect(compte.form).not.toBeNull();
    expect(actuel.form).toBe(compte.form);
    expect(nouveau.form).toBe(compte.form);
  });

  it("transmet les deux mots de passe au serveur", () => {
    openDialog();

    fireEvent.change(screen.getByLabelText("Mot de passe actuel"), {
      target: { value: "ancien-mot-de-passe" },
    });
    fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), {
      target: { value: "nouveau-mot-de-passe" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Changer" }));

    expect(mockChangePasswordMutate).toHaveBeenCalledWith({
      currentPassword: "ancien-mot-de-passe",
      newPassword: "nouveau-mot-de-passe",
    });
  });

  /**
   * Le schéma partagé avec le serveur refuse un mot de passe identique. La
   * vérification côté écran évite un aller-retour pour une erreur évidente.
   */
  it("refuse un nouveau mot de passe identique à l'actuel, sans appeler le serveur", () => {
    openDialog();

    fireEvent.change(screen.getByLabelText("Mot de passe actuel"), {
      target: { value: "meme-mot-de-passe" },
    });
    fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), {
      target: { value: "meme-mot-de-passe" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Changer" }));

    expect(mockChangePasswordMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
