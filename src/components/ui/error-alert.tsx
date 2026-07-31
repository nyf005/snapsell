"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { formatError, type ErrorContext, type UserError } from "~/lib/copy";
import { buildSupportHref } from "~/lib/support";
import { cn } from "~/lib/utils";
import { env } from "~/env";

type ErrorAlertProps = {
  /** Un UserError déjà formaté, ou une erreur brute à formater. */
  error: UserError | unknown;
  /** Domaine appelant, utilisé si `error` n'est pas encore formaté. */
  context?: ErrorContext;
  className?: string;
};

function isUserError(value: unknown): value is UserError {
  return (
    typeof value === "object" &&
    value !== null &&
    "title" in value &&
    typeof (value as UserError).title === "string"
  );
}

/**
 * Affiche une erreur en respectant la forme prescrite par DESIGN.md :
 * ce qui s'est passé, pourquoi si connu, comment continuer.
 *
 * À utiliser en ligne, près du champ ou de la section concernée. Les erreurs qui
 * demandent une correction de l'utilisateur ne doivent jamais partir en toast.
 */
export function ErrorAlert({ error, context = "generic", className }: ErrorAlertProps) {
  if (error == null) return null;

  const { title, detail, action, reference } = isUserError(error)
    ? error
    : formatError(error, context);

  // Le serveur n'attache une référence qu'aux erreurs inattendues, celles dont
  // le message reste générique. C'est précisément là que la vendeuse n'a aucun
  // moyen de s'en sortir seule, et qu'il faut lui donner de quoi être aidée.
  const supportHref = reference
    ? buildSupportHref(env.NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER, {
        screen: typeof window === "undefined" ? null : window.location.pathname,
        reference,
      })
    : null;

  return (
    <Alert variant="destructive" className={cn(className)}>
      <AlertCircle />
      <AlertTitle className="line-clamp-none">{title}</AlertTitle>
      {(detail ?? action ?? reference) && (
        <AlertDescription>
          {detail && <p>{detail}</p>}
          {action && (
            <Link
              href={action.href}
              className="font-semibold text-destructive underline underline-offset-2"
            >
              {action.label}
            </Link>
          )}
          {reference && supportHref && (
            <p className="text-xs">
              {/* Sélectionnable et lisible à voix haute : ces références se
                  recopient depuis un écran de téléphone, ou se dictent. */}
              Référence <span className="select-all font-mono">{reference}</span>
              {" — "}
              <a
                href={supportHref}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline underline-offset-2"
              >
                nous contacter
              </a>
            </p>
          )}
        </AlertDescription>
      )}
    </Alert>
  );
}
