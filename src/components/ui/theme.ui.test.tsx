import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import {
  shouldUseDark,
  ThemeProvider,
  ThemeToggle,
  THEME_STORAGE_KEY,
  themeInitScript,
} from "./theme";

/** Simule la préférence système du navigateur. */
function mockPrefersDark(dark: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("dark") ? dark : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  mockPrefersDark(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shouldUseDark — règle partagée script/React", () => {
  it("respecte un choix explicite", () => {
    expect(shouldUseDark("dark", false)).toBe(true);
    expect(shouldUseDark("light", true)).toBe(false);
  });

  it("suit le système sans choix explicite", () => {
    expect(shouldUseDark(null, true)).toBe(true);
    expect(shouldUseDark(null, false)).toBe(false);
    expect(shouldUseDark("system", true)).toBe(true);
    expect(shouldUseDark("system", false)).toBe(false);
  });

  it("ignore une valeur stockée invalide", () => {
    expect(shouldUseDark("bleu", true)).toBe(true);
    expect(shouldUseDark("", false)).toBe(false);
  });
});

describe("themeInitScript", () => {
  it("applique la classe avant l’hydratation, sans dépendre de React", () => {
    // Le script doit lire localStorage, interroger matchMedia et poser la classe.
    expect(themeInitScript).toContain(THEME_STORAGE_KEY);
    expect(themeInitScript).toContain("prefers-color-scheme: dark");
    expect(themeInitScript).toContain("classList.toggle");
    // Un try/catch est indispensable : localStorage lève en navigation privée.
    expect(themeInitScript).toContain("try");
    expect(themeInitScript).toContain("catch");
  });
});

describe("ThemeToggle", () => {
  function renderToggle() {
    return render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
  }

  it("propose les trois choix", async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.click(screen.getByRole("button", { name: /Apparence/ }));

    expect(screen.getByRole("menuitem", { name: "Clair" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Sombre" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Comme mon téléphone" })).toBeInTheDocument();
  });

  it("applique et retient le choix « Sombre »", async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.click(screen.getByRole("button", { name: /Apparence/ }));
    await user.click(screen.getByRole("menuitem", { name: "Sombre" }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("applique et retient le choix « Clair » malgré un système sombre", async () => {
    mockPrefersDark(true);
    const user = userEvent.setup();
    renderToggle();
    await user.click(screen.getByRole("button", { name: /Apparence/ }));
    await user.click(screen.getByRole("menuitem", { name: "Clair" }));

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("« Comme mon téléphone » repasse sur la préférence système", async () => {
    mockPrefersDark(true);
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole("button", { name: /Apparence/ }));
    await user.click(screen.getByRole("menuitem", { name: "Clair" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await user.click(screen.getByRole("button", { name: /Apparence/ }));
    await user.click(screen.getByRole("menuitem", { name: "Comme mon téléphone" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
  });

  it("le libellé du bouton reflète le choix courant", async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.click(screen.getByRole("button", { name: /Apparence/ }));
    await user.click(screen.getByRole("menuitem", { name: "Sombre" }));

    expect(screen.getByRole("button", { name: "Apparence : Sombre" })).toBeInTheDocument();
  });
});
