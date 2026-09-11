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
  await expect(page.getByRole("heading", { name: "Le bilan de vos ventes" })).toBeVisible();
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
