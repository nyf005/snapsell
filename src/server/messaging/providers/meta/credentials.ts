import { TRPCError } from "@trpc/server";

import { appError } from "~/server/api/errors";

/** Valide qu'un numéro appartient bien au WABA avec le jeton fourni. */
export async function validateMetaCredentials(opts: {
  phoneId: string;
  wabaId: string | null;
  accessToken: string;
}): Promise<void> {
  const { phoneId, wabaId, accessToken } = opts;

  try {
    if (wabaId) {
      const response = await fetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(wabaId)}/phone_numbers?limit=100`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!response.ok) {
        throw appError("BAD_REQUEST", "whatsapp.invalidCredentials", {
          logMessage: "meta phone_numbers lookup refused",
        });
      }

      const body = (await response.json()) as { data?: Array<{ id: string }> };
      if (!(body.data ?? []).some((phone) => phone.id === phoneId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Le Phone Number ID ne correspond pas à ce compte WABA.",
        });
      }
      return;
    }

    const response = await fetch(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Les identifiants WhatsApp sont invalides.",
      });
    }
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Impossible de contacter Meta. Réessayez dans quelques instants.",
    });
  }
}
