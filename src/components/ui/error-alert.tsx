"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { formatError, type ErrorContext, type UserError } from "~/lib/copy";
import { cn } from "~/lib/utils";

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

  const { title, detail, action } = isUserError(error)
    ? error
    : formatError(error, context);

  return (
    <Alert variant="destructive" className={cn(className)}>
      <AlertCircle />
      <AlertTitle className="line-clamp-none">{title}</AlertTitle>
      {(detail ?? action) && (
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
        </AlertDescription>
      )}
    </Alert>
  );
}
