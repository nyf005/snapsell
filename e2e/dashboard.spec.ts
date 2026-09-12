import { test, expect, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/index.js";
import { hash } from "bcrypt";
import { randomUUID } from "node:crypto";

const url = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
  throw new Error("DATABASE_URL doit désigner la base locale de test");
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
const email = `browser-${randomUUID()}@example.test`;
const password = "BrowserTest123!";
let tenantId: string;

test.beforeAll(async () => {
  const tenant = await db.tenant.create({ data: { name: "Boutique navigateur" } });
  tenantId = tenant.id;
  await db.user.create({ data: { tenantId, email, passwordHash: await hash(password, 10), role: "OWNER" } });
});
test.afterAll(async () => {
  if (tenantId) await db.tenant.delete({ where: { id: tenantId } });
  await db.$disconnect();
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Adresse email", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("connexion, activité et commandes accessibles sur mobile et ordinateur", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Votre travail", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Le bilan de vos ventes" })).not.toBeVisible();
  await page.getByRole("link", { name: "Commandes", exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/orders/);
  await expect(page.getByRole("heading", { name: "Commandes", exact: true })).toBeVisible();
});

test("une panne du résumé affiche une erreur et Réessayer restaure l'activité", async ({ page }) => {
  await page.route("**/api/trpc/**", async (route) => {
    if (route.request().url().includes("dashboard.getSummary")) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { json: { message: "Indisponible", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 503 } } } }) });
    } else await route.continue();
  });
  await login(page);
  await expect(page.getByRole("button", { name: "Réessayer", exact: true }).first()).toBeVisible();
  await page.unroute("**/api/trpc/**");
  await page.getByRole("button", { name: "Réessayer", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Votre travail", exact: true })).toBeVisible();
});

test("les pages métier exigent une connexion", async ({ page }) => {
  await page.goto("/dashboard/orders");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "Se connecter", exact: true })).toBeVisible();
});


test("le mot de passe oublié explique comment contacter l’assistance", async ({ page }) => {
  await page.goto("/login");
  await page.getByText("Mot de passe oublié ?", { exact: true }).click();
  await expect(page.getByText("La réinitialisation automatique par email n’est pas encore disponible.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Contacter l’assistance par email" })).toHaveAttribute("href", /^mailto:contact@snapsell.app/);
  await expect(page.getByRole("button", { name: "Se connecter", exact: true })).toBeVisible();
});

test("les quatre destinations conservent les accès aux paiements et aux réglages", async ({ page }) => {
  await login(page);
  const primary = page.getByRole("navigation", { name: "Navigation mobile" });
  const navigation = await primary.isVisible() ? primary : page.getByLabel("Navigation principale");
  await expect(navigation.getByRole("link")).toHaveCount(4);
  for (const name of ["Aujourd’hui", "Live", "Commandes", "Boutique"]) {
    await expect(navigation.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await navigation.getByRole("link", { name: "Commandes", exact: true }).click();
  await page.getByRole("link", { name: "Paiements à vérifier", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Paiements à vérifier" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Commandes", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Retour à Commandes" }).click();
  await expect(page.getByRole("button", { name: "À traiter", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "En cours", exact: true }).click();
  await expect(page.getByRole("button", { name: "En cours", exact: true })).toHaveAttribute("aria-pressed", "true");
  await navigation.getByRole("link", { name: "Boutique", exact: true }).click();
  const main = page.getByRole("main");
  for (const href of ["/dashboard/catalogue", "/parametres/prix", "/parametres/livraison", "/parametres/whatsapp", "/parametres/reponses", "/parametres/team", "/parametres/abonnement", "/dashboard/audit"]) {
    await expect(main.locator(`a[href="${href}"]`)).toBeVisible();
  }
  await main.locator('a[href="/dashboard/catalogue"]').click();
  await expect(navigation.getByRole("link", { name: "Boutique", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Retour à Boutique" })).toBeVisible();
});

test("un agent conserve catalogue et historique, les réglages restent protégés", async ({ page }) => {
  const agentEmail = `agent-${randomUUID()}@example.test`;
  await db.user.create({ data: { tenantId, email: agentEmail, passwordHash: await hash(password, 10), role: "AGENT" } });
  await page.goto("/login");
  await page.getByLabel("Adresse email", { exact: true }).fill(agentEmail);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("link", { name: "Boutique", exact: true }).filter({ visible: true }).first().click();
  const main = page.getByRole("main");
  await expect(main.locator('a[href="/dashboard/catalogue"]')).toBeVisible();
  await expect(main.locator('a[href="/dashboard/audit"]')).toBeVisible();
  await expect(main.locator('a[href^="/parametres"]')).toHaveCount(0);
  await page.goto("/parametres");
  await expect(page.getByText("Page réservée", { exact: true })).toBeVisible();
  await expect(main.locator('a[href="/parametres/prix"]')).toHaveCount(0);
});

test("les filtres restent accessibles et les actions secondaires du catalogue conservent la suppression", async ({ page }) => {
  await db.catalogueItem.create({ data: { tenantId, code: "UX-ARTICLE", name: "Article de test", amount: 500000 } });
  await login(page);
  await page.goto("/dashboard/orders");
  await expect(page.getByLabel("Vue ou statut")).not.toBeVisible();
  await page.locator("summary").filter({ hasText: "Filtres" }).click();
  await expect(page.getByLabel("Vue ou statut")).toBeVisible();
  await page.getByLabel("Vue ou statut").click();
  await page.getByRole("option", { name: "Livrée", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Filtres" }).click();
  await expect(page.locator("summary").filter({ hasText: "Filtres" })).toContainText("Livrée");
  await page.goto("/dashboard/catalogue");
  await expect(page.getByRole("button", { name: "Modifier l’article UX-ARTICLE" }).filter({ visible: true })).toBeVisible();
  await page.getByRole("button", { name: "Autres actions pour l’article UX-ARTICLE" }).filter({ visible: true }).click();
  await page.getByRole("menuitem", { name: "Supprimer l’article UX-ARTICLE" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.getByRole("button", { name: "Modifier l’article UX-ARTICLE" }).filter({ visible: true })).toBeVisible();
});

test("la preuve mobile ouvre la commande et reste prioritaire dans son détail", async ({ page }, testInfo) => {
  const item = await db.catalogueItem.create({ data: { tenantId, code: "UX-PREUVE", amount: 500000 } });
  const reservation = await db.reservation.create({ data: {
    tenantId, catalogueItemId: item.id, clientPhone: "+2250701020304", correlationId: randomUUID(),
    status: "confirmed", address: "Cocody, Abidjan",
  } });
  const order = await db.order.create({ data: { tenantId, reservationId: reservation.id, orderNumber: "SS-UX", status: "confirmed_pending_deposit", depositStatus: "deposit_pending" } });
  await db.paymentProof.create({ data: { tenantId, orderId: order.id, textPayload: "Virement reçu — référence UX-123", correlationId: randomUUID() } });
  await login(page);
  await page.goto("/dashboard/proofs");
  await expect(page.getByText("Virement reçu — référence UX-123").filter({ visible: true })).toBeVisible();
  await page.getByRole("button", { name: "Voir la commande SS-UX" }).filter({ visible: true }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("region", { name: "Paiement à vérifier" })).toBeVisible();
  await expect(panel.getByText("Cocody, Abidjan")).toBeVisible();
  await expect(panel.getByRole("button", { name: /Valider la preuve/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("payment-detail.png"), fullPage: true, animations: "disabled" });
});
