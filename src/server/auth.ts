import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcrypt";

import { loginInputSchema } from "~/lib/validations/login";
import { checkLoginRateLimit, getClientIpFromHeaders } from "~/lib/rate-limit";
import { createLogger } from "~/lib/logger";
import { db } from "~/server/db";
import type { Role } from "../../generated/prisma";

const authLogger = createLogger("Auth");

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      tenantId: string | null; // null pour les users OPS (pas de tenant)
      role: Role;
    };
  }
}

/**
 * ── `lax` SUFFIT AU RETOUR PAYSTACK, `none` NE SE JUSTIFIAIT PAS ─────────────
 *
 * Le cookie était posé en `sameSite: "none"` en production, au motif qu'il
 * fallait le transmettre au retour d'une redirection externe. Le motif est réel
 * mais la valeur est trop large : `none` envoie le cookie de session sur
 * **toute** requête inter-site, y compris celles qu'une page tierce déclenche à
 * l'insu de l'utilisatrice.
 *
 * Or ce retour est une navigation de premier niveau en GET — exactement ce que
 * `lax` laisse passer par définition. Le comportement Paystack est donc
 * inchangé, et la surface CSRF se referme.
 *
 * `secure` reste conditionné à HTTPS : en développement sur http://localhost,
 * un cookie `secure` ne serait jamais posé et la connexion échouerait.
 * ────────────────────────────────────────────────────────────────────────────
 */
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
const useSecureCookie =
  process.env.NODE_ENV === "production" && appUrl.startsWith("https://");

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  cookies: useSecureCookie
    ? {
        sessionToken: {
          options: {
            sameSite: "lax",
            secure: true,
          },
        },
      }
    : undefined,
  providers: [
    Credentials({
      id: "credentials",
      name: "Email / Mot de passe",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = loginInputSchema.safeParse({
          email: credentials?.email,
          password: credentials?.password,
        });
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        /**
         * Le frein passe **avant** le `compare()` bcrypt, à dessein : c'est lui
         * qui coûte, et le laisser derrière reviendrait à offrir le calcul à
         * chaque tentative refusée.
         *
         * En cas de dépassement on renvoie `null`, comme pour un mot de passe
         * faux. Distinguer les deux dirait à l'attaquant que le compte existe et
         * qu'il a touché juste ; la vendeuse, elle, voit le même message et
         * réessaie plus tard. Le journal, lui, garde la trace.
         */
        const ip = getClientIpFromHeaders(
          request?.headers ?? new Headers(),
        );
        if (!(await checkLoginRateLimit(email, ip))) {
          authLogger.warn("Tentatives de connexion trop nombreuses", { ip });
          return null;
        }

        const user = await db.user.findUnique({
          where: { email },
        });
        if (!user?.passwordHash) return null;
        const ok = await compare(password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
          tenantId: user.tenantId ?? null,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = (user as { id?: string }).id ?? token.sub;
        token.tenantId = (user as { tenantId?: string | null }).tenantId ?? null;
        token.role = (user as { role?: Role }).role;
        // Stocker tokenVersion au login initial pour détection de révocation
        const dbUserAtLogin = await db.user.findUnique({
          where: { id: (user as { id?: string }).id ?? "" },
          select: { tokenVersion: true },
        });
        if (dbUserAtLogin) {
          token.tokenVersion = dbUserAtLogin.tokenVersion;
        }
        token.tokenVersionCheckedAt = Date.now();
      }

      // Relire depuis la base uniquement si le role est absent (premier login / token existant)
      // Pour les OPS, tenantId est légitimement null
      if (!token.role && token.email) {
        const dbUser = await db.user.findUnique({
          where: { email: token.email as string },
          select: { tenantId: true, role: true, tokenVersion: true },
        });
        if (dbUser) {
          token.tenantId = dbUser.tenantId;
          token.role = dbUser.role;
          token.tokenVersion = dbUser.tokenVersion;
          token.tokenVersionCheckedAt = Date.now();
        }
      }

      // Vérification périodique du tokenVersion (toutes les heures).
      // Permet d'invalider les tokens sans attendre leur expiration (ex: changement mot de passe).
      // Retourner null force NextAuth à invalider la session et le cookie → re-login.
      const checkedAt = token.tokenVersionCheckedAt as number | undefined;
      const ONE_HOUR_MS = 60 * 60 * 1000;
      if (token.sub && checkedAt && Date.now() - checkedAt > ONE_HOUR_MS) {
        const dbUser = await db.user.findUnique({
          where: { id: token.sub as string },
          select: { tokenVersion: true },
        });
        if (!dbUser || dbUser.tokenVersion !== (token.tokenVersion as number | undefined)) {
          return null; // Token révoqué → force re-login
        }
        token.tokenVersionCheckedAt = Date.now();
      }

      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        Object.assign(session.user, {
          id: (token.sub as string) ?? "",
          tenantId: (token.tenantId as string | null) ?? null,
          // Repli sur le rôle le plus étroit, et non sur OWNER.
          //
          // Un jeton sans rôle est un état anormal : le callback `jwt` ci-dessus le
          // relit en base dès qu'il manque. S'il manque quand même — utilisateur
          // supprimé, lecture en échec — accorder l'accès complet est le pire des
          // choix possibles. AGENT ne donne aucun droit de configuration : la
          // personne voit moins que prévu au lieu de voir tout.
          role: ((token.role as Role | undefined) ?? "AGENT") as Role,
        });
      }
      return session;
    },
  },
});
