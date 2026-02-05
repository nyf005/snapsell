import { NextRequest, NextResponse } from "next/server";

import { db } from "~/server/db";
import { hashToken } from "~/server/api/routers/invitations";
import { hash } from "bcrypt";

/**
 * Route API pour accepter une invitation et créer une session serveur-side
 * Cette route gère l'acceptation complète : création compte + session
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, name, password } = body;

    if (!token || !name || !password) {
      return NextResponse.json(
        { error: "Token, nom et mot de passe requis." },
        { status: 400 },
      );
    }

    // Valider et récupérer l'invitation
    const tokenHash = hashToken(token);
    // Rechercher d'abord par tokenHash (nouveau), puis par token (ancien pour compatibilité)
    const inv = await db.invitation.findFirst({
      where: {
        OR: [
          { tokenHash },
          { token }, // Fallback pour compatibilité
        ],
      },
    });

    if (!inv) {
      return NextResponse.json(
        { error: "Invitation introuvable ou expirée." },
        { status: 404 },
      );
    }

    if (inv.consumedAt) {
      return NextResponse.json(
        { error: "Cette invitation a déjà été utilisée." },
        { status: 410 },
      );
    }

    if (inv.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Cette invitation a expiré." },
        { status: 410 },
      );
    }

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await db.user.findUnique({
      where: { email: inv.email },
    });

    if (existingUser) {
      if (existingUser.tenantId === inv.tenantId) {
        // Consommer l'invitation et rediriger vers login
        await db.invitation.update({
          where: { id: inv.id },
          data: { consumedAt: new Date() },
        });
        return NextResponse.json(
          { error: "Vous êtes déjà membre de cette équipe.", redirectTo: "/login?message=already_member" },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "Un compte existe déjà avec cet email pour un autre tenant." },
        { status: 409 },
      );
    }

    // Créer le compte utilisateur
    const passwordHash = await hash(password, 10);
    const user = await db.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          tenantId: inv.tenantId,
          email: inv.email,
          name: name.trim(),
          passwordHash,
          role: inv.role,
        },
      });
      await tx.invitation.update({
        where: { id: inv.id },
        data: { consumedAt: new Date() },
      });
      return newUser;
    });

    // Créer la session NextAuth serveur-side
    // Note: Avec NextAuth v5, on doit utiliser signIn() qui nécessite un contexte de requête
    // Pour l'instant, retourner un token de session ou rediriger vers une route qui crée la session
    // Solution temporaire : retourner succès et laisser le client créer la session avec les credentials
    
    return NextResponse.json({
      success: true,
      userId: user.id,
      email: user.email,
      message: "Compte créé avec succès. Vous allez être connecté automatiquement.",
      // Le client utilisera ces credentials pour créer la session
      requiresSignIn: true,
    });
  } catch (error) {
    console.error("Erreur lors de l'acceptation d'invitation:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'acceptation de l'invitation." },
      { status: 500 },
    );
  }
}
