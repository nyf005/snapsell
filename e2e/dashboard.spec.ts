import { test, expect, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/index.js";
import { hash } from "bcrypt";
import { createHash, randomUUID } from "node:crypto";

const url = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
  throw new Error("DATABASE_URL doit désigner la base locale de test");
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
let email = `browser-${randomUUID()}@example.test`;
const password = "BrowserTest123!";
let tenantId: string;

// Independent visitors: one suite must not consume a shared IP's login allowance.
test.beforeEach(async ({ context }, testInfo) => {
  const bytes = createHash("sha256").update(testInfo.testId).digest();
  const ip = `198.18.${bytes[0]}.${bytes[1]}`;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": ip, "x-real-ip": ip });
  email = `browser-${randomUUID()}@example.test`;
  const tenant = await db.tenant.create({ data: { name: "Boutique navigateur" } });
  tenantId = tenant.id;
  await db.user.create({ data: { tenantId, email, passwordHash: await hash(password, 10), role: "OWNER" } });
});
test.afterEach(async () => {
  if (tenantId) await db.tenant.delete({ where: { id: tenantId } });
});
test.afterAll(async () => { await db.$disconnect(); });

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Adresse email", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("connexion, activité et commandes accessibles sur mobile et ordinateur", async ({ page }, testInfo) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Votre travail", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Le bilan de vos ventes" })).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("today.png"), fullPage: true });
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

test("les quatre destinations conservent les accès aux paiements et aux réglages", async ({ page }, testInfo) => {
  await login(page);
  const primary = page.getByRole("navigation", { name: "Navigation mobile" });
  const navigation = await primary.isVisible() ? primary : page.getByLabel("Navigation principale");
  await expect(navigation.getByRole("link")).toHaveCount(4);
  for (const name of ["Aujourd’hui", "Live", "Commandes", "Boutique"]) {
    await expect(navigation.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await navigation.getByRole("link", { name: "Commandes", exact: true }).click();
  await page.getByRole("link", { name: "Historique et traitement des preuves", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Paiements à vérifier" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Commandes", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Retour à Commandes" }).click();
  await expect(page.getByRole("button", { name: /^À traiter(?:\s+\d+)?$/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^En cours(?:\s+\d+)?$/ }).click();
  await expect(page.getByRole("button", { name: /^En cours(?:\s+\d+)?$/ })).toHaveAttribute("aria-pressed", "true");
  await navigation.getByRole("link", { name: "Boutique", exact: true }).click();
  const main = page.getByRole("main");
  for (const href of ["/dashboard/catalogue", "/parametres/prix", "/parametres/livraison", "/parametres/whatsapp", "/parametres/reponses", "/parametres/team", "/parametres/abonnement", "/dashboard/audit"]) {
    await expect(main.locator(`a[href="${href}"]`)).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath("boutique.png"), fullPage: true });
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
  await page.getByRole("button", { name: /^Terminées/ }).click();
  const deliveredFilter = page.getByRole("button", { name: /^Livrées/ });
  await expect(deliveredFilter).toBeVisible();
  await deliveredFilter.click();
  await expect(deliveredFilter).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Affiner", exact: true }).click();
  await expect(page.getByLabel("Statut précis")).toBeVisible();
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

async function paymentOrder(number: string, proof: boolean) {
  const item = await db.catalogueItem.create({ data: { tenantId, code: number, amount: 1000000 } });
  const reservation = await db.reservation.create({ data: { tenantId, catalogueItemId: item.id, clientPhone: "+2250701020304", correlationId: randomUUID(), status: "confirmed", address: "Cocody" } });
  return db.order.create({ data: { tenantId, reservationId: reservation.id, orderNumber: number, status: "confirmed_pending_deposit", depositStatus: "deposit_pending", depositAmountCents: 300000, depositPercentSnapshot: 30, itemsTotalCents: 1000000, ...(proof ? { paymentProofs: { create: { tenantId, correlationId: randomUUID(), textPayload: `Justificatif ${number}` } } } : {}) } });
}

test("commandes : distinguer acompte attendu et preuve reçue, puis valider sur place", async ({ page }, testInfo) => {
  const ready = await paymentOrder("SS-READY", true);
  await paymentOrder("SS-WAITING", false);
  await login(page);
  await page.goto("/dashboard/orders");
  const readyRow = page.locator("tr, li").filter({ has: page.getByRole("button", { name: "SS-READY", exact: true }) }).filter({ visible: true });
  const waitingRow = page.locator("tr, li").filter({ has: page.getByRole("button", { name: "SS-WAITING", exact: true }) }).filter({ visible: true });
  await expect(readyRow.getByText("Preuve à vérifier", { exact: true })).toBeVisible();
  await expect(waitingRow).toHaveCount(0);
  await page.getByRole("button", { name: /^En cours/ }).click();
  await expect(waitingRow.getByText("Acompte attendu", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^À traiter/ }).click();
  await page.getByRole("button", { name: /Paiements à vérifier/ }).click();
  await expect(page.getByRole("button", { name: "SS-WAITING", exact: true }).filter({ visible: true })).toHaveCount(0);
  await expect(readyRow.getByRole("button", { name: "Vérifier le paiement" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("orders-payments.png"), fullPage: true, animations: "disabled" });
  await readyRow.getByRole("button", { name: "Vérifier le paiement" }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText(/3.?000.*FCFA/).first()).toBeVisible();
  await panel.getByRole("button", { name: /Valider la preuve/ }).click();
  await expect(panel.getByText(/Acompte validé/).first()).toBeVisible();
  await expect(panel.getByRole("button", { name: "Préparer", exact: true })).toBeVisible();
  expect((await db.order.findUniqueOrThrow({ where: { id: ready.id } })).depositStatus).toBe("deposit_approved");
});

test("le propriétaire configure le pourcentage sans modifier les acomptes existants", async ({ page }, testInfo) => {
  await login(page);
  await page.goto("/parametres/prix");
  await page.getByRole("switch", { name: "Demander un acompte" }).check();
  await page.getByLabel("Pourcentage de l’acompte").fill("25");
  await page.getByRole("button", { name: "Enregistrer la règle" }).click();
  await expect(page.getByText("Règle d’acompte enregistrée.")).toBeVisible();
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  expect(tenant.depositPercent).toBe(25);
  expect(tenant.requireDeposit).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("pricing-settings.png"), fullPage: true, animations: "disabled" });
});

test("le tarif de livraison donne le montant appliqué et la règle prioritaire", async ({ page }, testInfo) => {
  await db.deliveryZone.create({ data: { tenantId, name: "Abidjan test", amount: 200000, communes: { create: { communeName: "Cocody" } } } });
  await db.deliveryFeeCommune.create({ data: { tenantId, communeName: "Cocody", amount: 150000 } });
  await login(page);
  await page.goto("/parametres/livraison");
  await page.getByLabel("Quel tarif sera appliqué ?").fill("Cocody");
  await page.getByRole("button", { name: "Vérifier le tarif" }).click();
  await expect(page.getByRole("status")).toContainText("Tarif spécifique : Cocody");
  await expect(page.getByRole("status")).toContainText(/1.?500/);
  await page.screenshot({ path: testInfo.outputPath("delivery-settings.png"), fullPage: true, animations: "disabled" });
});

test("les compteurs et la recherche couvrent aussi les commandes non chargées", async ({ page }) => {
  const prefix = `SS-BATCH-${randomUUID().slice(0, 8)}`;
  for (let index = 0; index < 21; index++) {
    const reservation = await db.reservation.create({ data: { tenantId, clientPhone: "+2250701020304", correlationId: randomUUID(), status: "confirmed" } });
    await db.order.create({ data: { tenantId, reservationId: reservation.id, orderNumber: `${prefix}-${String(index).padStart(2, "0")}`, status: "confirmed", depositStatus: "no_deposit" } });
  }
  const confirmedCount = await db.order.count({ where: { tenantId, status: "confirmed" } });
  await login(page);
  await page.goto("/dashboard/orders");
  const readyFilter = page.getByRole("button", { name: new RegExp(`^À préparer ${confirmedCount}$`) });
  await expect(readyFilter).toBeVisible();
  await readyFilter.click();
  await expect(page.getByRole("status").filter({ hasText: `${confirmedCount} commandes` })).toBeVisible();
  await page.getByLabel("Rechercher", { exact: true }).fill(`${prefix}-00`);
  await expect(page.getByRole("button", { name: `${prefix}-00`, exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^1 commande$/ })).toBeVisible();
  await page.getByRole("button", { name: "Affiner", exact: true }).click();
  await page.getByLabel("Statut précis").selectOption("confirmed");
  await page.getByRole("button", { name: "Fermer les filtres" }).click();
  await expect(page.getByRole("button", { name: "Retirer le statut" })).toBeVisible();
  await expect(page.getByRole("button", { name: `${prefix}-00`, exact: true }).filter({ visible: true })).toBeVisible();
});

test("les pages publiques présentent les offres et des liens utiles", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Vos commandes WhatsApp");
  await expect(page.getByText("Exemple illustratif avec des données fictives.", { exact: false })).toBeVisible();
  await expect(page.locator('footer a[href="#"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("public-home.png"), fullPage: true, animations: "disabled" });
  await page.goto("/tarifs");
  await expect(page.getByText("Le plus populaire", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Choisir Starter" })).toHaveAttribute("href", "/login?tab=signup&plan=starter");
  await page.screenshot({ path: testInfo.outputPath("public-pricing.png"), fullPage: true, animations: "disabled" });
  await expect(page.getByRole("heading", { name: "Comparer les forfaits", exact: true })).toBeVisible();
  await expect(page.getByText("Packs de conversations", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole("link", { name: "Comprendre le calcul des conversations" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("conversations client");
});

test("le choix Starter survit à la bascule vers la connexion", async ({ page }) => {
  await page.goto("/login?tab=signup&plan=starter");
  await page.getByRole("button", { name: "Connexion", exact: true }).click();
  await expect(page).toHaveURL(/plan=starter/);
  await page.getByLabel("Adresse email", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/tarifs\?plan=starter$/);
  await expect(page.getByRole("status")).toContainText("Votre choix : Starter");
  await expect(page.getByRole("link", { name: "Continuer avec Starter" })).toHaveAttribute("href", "/api/payment/subscribe?plan=starter");
});

test("l’inscription conserve Pro sans activer un abonnement avant paiement", async ({ page }, testInfo) => {
  const signupEmail = `public-${randomUUID()}@example.test`;
  let paymentRequests = 0;
  await page.route("**/api/payment/subscribe**", async (route) => { paymentRequests++; await route.fulfill({ status: 418 }); });
  try {
    await page.goto("/login?tab=signup&plan=pro");
    await page.getByLabel("Nom de la boutique").fill("Boutique publique de test");
    await page.getByLabel("Adresse email", { exact: true }).fill(signupEmail);
    await page.getByLabel("Mot de passe", { exact: true }).fill(password);
    await page.screenshot({ path: testInfo.outputPath("public-signup.png"), fullPage: true, animations: "disabled" });
    await page.getByRole("button", { name: "Commencer gratuitement", exact: true }).click();
    await expect(page).toHaveURL(/\/tarifs\?plan=pro$/);
    await expect(page.getByRole("status")).toContainText("Votre choix : Pro");
    await expect(page.getByRole("link", { name: "Continuer avec Pro" })).toHaveAttribute("href", "/api/payment/subscribe?plan=pro");
    expect(paymentRequests).toBe(0);
    const createdUser = await db.user.findUniqueOrThrow({ where: { email: signupEmail }, include: { tenant: true } });
    expect(createdUser.tenant?.subscriptionPlan).toBe("free");
  } finally {
    const createdUser = await db.user.findUnique({ where: { email: signupEmail } });
    if (createdUser?.tenantId) await db.tenant.delete({ where: { id: createdUser.tenantId } });
  }
});

test("un article similaire conserve les saisies jusqu’à l’abandon explicite", async ({ page }, testInfo) => {
  await db.catalogueItem.create({ data: { tenantId, code: "MODELE-UX", name: "Sac modèle", amount: 500000 } });
  await login(page);
  await page.goto("/dashboard/catalogue");
  await page.getByRole("button", { name: "Autres actions pour l’article MODELE-UX" }).filter({ visible: true }).click();
  await page.getByRole("menuitem", { name: "Créer un article similaire" }).click();
  await expect(page.getByLabel("Nom de l'article", { exact: true })).toHaveValue("Sac modèle");
  await page.getByLabel("Code *", { exact: true }).fill("NOUVEAU-UX");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Continuer à modifier" }).click();
  await expect(page.getByLabel("Code *", { exact: true })).toHaveValue("NOUVEAU-UX");
  await page.screenshot({ path: testInfo.outputPath("article-similaire.png"), fullPage: true });
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page.getByRole("button", { name: "Quitter sans enregistrer", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(await db.catalogueItem.count({ where: { tenantId, code: "NOUVEAU-UX" } })).toBe(0);
});


test("les interrupteurs et le champ acompte restent lisibles", async ({ page }, testInfo) => {
  await login(page);
  await page.goto("/parametres/prix");
  const toggle = page.getByRole("switch", { name: "Demander un acompte" });
  await expect(toggle).toBeEnabled();
  await toggle.scrollIntoViewIfNeeded();
  const box = await toggle.boundingBox();
  expect(box!.width).toBe(48);
  expect(box!.height).toBe(28);
  const label = page.locator('label[for="deposit-percent"]');
  const input = page.getByLabel("Pourcentage de l’acompte (%)");
  await input.scrollIntoViewIfNeeded();
  const labelBox = await label.boundingBox();
  const inputBox = await input.boundingBox();
  expect(inputBox!.y - labelBox!.y - labelBox!.height).toBeGreaterThanOrEqual(8);
  await toggle.click();
  await expect(toggle).toBeChecked();
  await input.fill("40");
  await page.getByRole("button", { name: "Enregistrer la règle" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Règle d’acompte enregistrée" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("deposit-layout.png"), fullPage: true });
});


test("connexion depuis un lien profond conserve la destination et ses filtres", async ({ page }) => {
  await page.goto("/dashboard/orders?queue=in_progress");
  await expect(page).toHaveURL(/callbackUrl=/);
  await page.getByLabel("Adresse email", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/orders\?queue=in_progress$/);
});
