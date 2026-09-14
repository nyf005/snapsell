"use client";

import { useEffect, useState } from "react";
import { UnsavedChangesDialog } from "~/components/ui/unsaved-changes-dialog";
import { useUnsavedChanges } from "~/hooks/use-unsaved-changes";
import { Save } from "lucide-react";

import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { TaskPageHeader } from "~/app/(dashboard)/_components/task-page-header";
import { BusinessHoursCard } from "~/app/(dashboard)/parametres/_components/business-hours-card";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { ErrorAlert } from "~/components/ui/error-alert";
import { Label } from "~/components/ui/label";
import { Spinner } from "~/components/ui/spinner";
import { AutoRepliesSkeleton } from "./auto-replies-skeletons";
import { api } from "~/trpc/react";

const FAQ_FIELDS = [
  {
    key: "faqDelivery" as const,
    label: "Livraison",
    description: "Répond aux questions sur les délais et les modes de livraison.",
    placeholder:
      "Ex : On livre à domicile dans Abidjan sous 24–48h. Pour l'intérieur du pays : 3–5 jours.",
  },
  {
    key: "faqPayment" as const,
    label: "Paiement",
    description: "Répond aux questions sur les moyens de paiement acceptés.",
    placeholder: "Ex : On accepte Wave, Orange Money, Mobile Money et les virements bancaires.",
  },
  {
    key: "faqLocation" as const,
    label: "Localisation",
    description: "Répond aux questions sur l'adresse ou le point de retrait.",
    placeholder:
      "Ex : Notre boutique est à Cocody, Angré 8ème tranche. Livraison à domicile disponible.",
  },
  {
    key: "faqAvailability" as const,
    label: "Disponibilité",
    description: "Répond aux questions sur la disponibilité des articles.",
    placeholder:
      "Ex : Les articles sont disponibles en quantités limitées. Réserve vite pour ne pas rater !",
  },
] as const;

type FaqKey = (typeof FAQ_FIELDS)[number]["key"];
type FaqValues = Record<FaqKey, string>;

/**
 * Réponses automatiques : questions fréquentes **et** horaires / message d'absence.
 *
 * Les deux étaient séparés — la FAQ sur sa propre page, les horaires enfouis dans
 * « Profil WhatsApp Business ». C'est pourtant un seul métier : ce que l’assistant dit
 * à votre place.
 */
export function AutoRepliesContent() {
  const [dirty, setDirty] = useState(false);
  const unsavedChanges = useUnsavedChanges(dirty);
  const { data, isLoading, error, refetch } = api.settings.getFaqSettings.useQuery();
  const utils = api.useUtils();
  const saveMutation = api.settings.setFaqSettings.useMutation({
    onSuccess: async () => {
      await utils.settings.getFaqSettings.invalidate();
      setDirty(false);
    },
  });

  const [values, setValues] = useState<FaqValues>({
    faqDelivery: "",
    faqPayment: "",
    faqLocation: "",
    faqAvailability: "",
  });

  useEffect(() => {
    if (data && !dirty) {
      setValues({
        faqDelivery: data.faqDelivery ?? "",
        faqPayment: data.faqPayment ?? "",
        faqLocation: data.faqLocation ?? "",
        faqAvailability: data.faqAvailability ?? "",
      });
    }
  }, [data, dirty]);

  function handleChange(key: FaqKey, value: string) {
    setDirty(true);
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    saveMutation.mutate({
      faqDelivery: values.faqDelivery || null,
      faqPayment: values.faqPayment || null,
      faqLocation: values.faqLocation || null,
      faqAvailability: values.faqAvailability || null,
    });
  }

  return (
    <>
      <UnsavedChangesDialog {...unsavedChanges} />
      <DashboardHeader />

      <div className="flex min-h-0 flex-1 flex-col space-y-5 overflow-y-auto p-4 md:p-6">
        <TaskPageHeader
          href="/parametres/reponses"
        />

        <nav aria-label="Réglages des réponses" className="flex flex-wrap gap-4 text-sm font-medium"><a className="min-h-11 py-3 text-primary underline underline-offset-4" href="#reponses-questions">Réponses aux questions</a><a className="min-h-11 py-3 text-primary underline underline-offset-4" href="#horaires">Horaires et message d’absence</a></nav>
        {error && <div role="alert"><ErrorAlert error={error} /><Button variant="outline" onClick={() => void refetch()}>Réessayer</Button></div>}
        {error && !data ? null : isLoading ? (
          <AutoRepliesSkeleton />
        ) : (
          <Card id="reponses-questions">
            <CardHeader className="pb-2 text-sm font-medium text-muted-foreground">
              Ouvrez un sujet pour modifier la réponse envoyée à votre clientèle. Une réponse vide est désactivée.
            </CardHeader>
            <CardContent className="flex flex-col gap-6 p-4 sm:p-6">
              {FAQ_FIELDS.map((field) => (
                <details key={field.key} className="border-b border-border pb-3 last:border-0">
                  <summary className="cursor-pointer py-2"><span className="font-medium">{field.label}</span><span className="ml-3 text-sm text-muted-foreground">{values[field.key].trim() ? "Configurée" : "Non configurée"}</span><span className="mt-1 block line-clamp-2 text-sm text-muted-foreground">{values[field.key].trim() || field.description}</span></summary>
                  <div className="mt-3 space-y-2">
                  <Label htmlFor={field.key} className="font-semibold">
                    {field.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">{field.description}</p>
                  <textarea
                    id={field.key}
                    className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder={field.placeholder}
                    value={values[field.key]}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    maxLength={1000}
                  />
                  <p className="text-right text-xs text-muted-foreground">
                    {values[field.key].length}/1000
                  </p>
                  </div>
                </details>
              ))}

              {saveMutation.isError && (
                <ErrorAlert error={saveMutation.error} context="generic" />
              )}
              {dirty && <p role="status" className="text-sm text-muted-foreground">Modifications non enregistrées</p>}
              {saveMutation.isSuccess && !dirty && (
                <Alert className="border-success/50 bg-success/10 text-success [&>svg]:text-success">
                  <AlertDescription>Vos réponses sont enregistrées.</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending || !dirty}
                className="sticky bottom-0 min-h-11 w-full shadow-sm sm:w-auto sm:self-end"
              >
                {saveMutation.isPending ? (
                  <Spinner className="mr-2 h-4 w-4" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Enregistrer
              </Button>
            </CardContent>
          </Card>
        )}

        <section id="horaires" className="scroll-mt-4"><BusinessHoursCard /></section>
      </div>
    </>
  );
}
