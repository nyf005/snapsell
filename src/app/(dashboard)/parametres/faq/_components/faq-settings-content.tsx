"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";

import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { Spinner } from "~/components/ui/spinner";
import { api } from "~/trpc/react";

const FAQ_FIELDS = [
  {
    key: "faqDelivery" as const,
    label: "Livraison",
    description: "Répond aux questions sur les délais, modes de livraison, etc.",
    placeholder: "Ex : On livre à domicile dans Abidjan sous 24–48h. Pour l'intérieur du pays : 3–5 jours.",
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
    placeholder: "Ex : Notre boutique est à Cocody, Angré 8ème tranche. Livraison à domicile disponible.",
  },
  {
    key: "faqAvailability" as const,
    label: "Disponibilité",
    description: "Répond aux questions sur la disponibilité des articles.",
    placeholder: "Ex : Les articles sont disponibles en quantités limitées. Réserve vite pour ne pas rater !",
  },
] as const;

type FaqKey = (typeof FAQ_FIELDS)[number]["key"];
type FaqValues = Record<FaqKey, string>;

export function FaqSettingsContent() {
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
    <div className="flex flex-col gap-6">
      <DashboardHeader
        heading="Réponses FAQ automatiques"
        text="Configure les réponses envoyées automatiquement quand un client pose une question fréquente via WhatsApp. Laisse un champ vide pour ne pas répondre automatiquement sur ce sujet."
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-2 text-sm font-medium text-muted-foreground">
            Chaque réponse sera envoyée automatiquement quand le bot détecte la question correspondante.
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
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
                <p className="text-xs text-muted-foreground text-right">
                  {values[field.key].length}/1000
                </p>
              </div>
            ))}

            <div className="flex items-center justify-between pt-2">
              {saveMutation.isSuccess && (
                <span className="text-sm text-green-600">Réponses enregistrées ✓</span>
              )}
              {saveMutation.isError && (
                <span className="text-sm text-red-600">Erreur lors de la sauvegarde.</span>
              )}
              {!saveMutation.isSuccess && !saveMutation.isError && <span />}

              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <Spinner className="mr-2 h-4 w-4" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Enregistrer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
