"use client";

import { useEffect, useState } from "react";
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
  const { data, isLoading } = api.settings.getFaqSettings.useQuery();
  const utils = api.useUtils();
  const saveMutation = api.settings.setFaqSettings.useMutation({
    onSuccess: () => {
      void utils.settings.getFaqSettings.invalidate();
    },
  });

  const [values, setValues] = useState<FaqValues>({
    faqDelivery: "",
    faqPayment: "",
    faqLocation: "",
    faqAvailability: "",
  });

  useEffect(() => {
    if (data) {
      setValues({
        faqDelivery: data.faqDelivery ?? "",
        faqPayment: data.faqPayment ?? "",
        faqLocation: data.faqLocation ?? "",
        faqAvailability: data.faqAvailability ?? "",
      });
    }
  }, [data]);

  function handleChange(key: FaqKey, value: string) {
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
      <DashboardHeader />

      <div className="flex min-h-0 flex-1 flex-col space-y-8 overflow-y-auto p-4 md:p-8">
        <TaskPageHeader
          href="/parametres/reponses"
        />

        {isLoading ? (
          <AutoRepliesSkeleton />
        ) : (
          <Card>
            <CardHeader className="pb-2 text-sm font-medium text-muted-foreground">
              Chaque réponse part automatiquement quand la question est posée
              correspondante. Laissez vide pour ne rien répondre.
            </CardHeader>
            <CardContent className="flex flex-col gap-6 p-4 sm:p-6">
              {FAQ_FIELDS.map((field) => (
                <div key={field.key} className="flex flex-col gap-1.5">
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
              ))}

              {saveMutation.isError && (
                <ErrorAlert error={saveMutation.error} context="generic" />
              )}
              {saveMutation.isSuccess && (
                <Alert className="border-success/50 bg-success/10 text-success [&>svg]:text-success">
                  <AlertDescription>Vos réponses sont enregistrées.</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="min-h-11 w-full sm:w-auto sm:self-end"
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

        <BusinessHoursCard />
      </div>
    </>
  );
}
