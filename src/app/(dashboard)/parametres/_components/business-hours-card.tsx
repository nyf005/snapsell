"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, MessageSquare } from "lucide-react";

import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { ErrorAlert } from "~/components/ui/error-alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { TimePickerField } from "~/components/ui/time-picker";
import { formatError, type UserError } from "~/lib/copy";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

const TIMEZONES = [
  { value: "Africa/Abidjan", label: "Abidjan (UTC+0)" },
  { value: "Africa/Dakar", label: "Dakar (UTC+0)" },
  { value: "Africa/Accra", label: "Accra (UTC+0)" },
  { value: "Africa/Lagos", label: "Lagos (UTC+1)" },
  { value: "Africa/Douala", label: "Douala (UTC+1)" },
  { value: "Africa/Nairobi", label: "Nairobi (UTC+3)" },
  { value: "Europe/Paris", label: "Paris (UTC+1/+2)" },
];

const fieldLabel =
  "mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground";

/**
 * Horaires d'ouverture et message d'absence.
 *
 * Vivait sur « Profil WhatsApp Business », une page nommée d'après un produit Meta,
 * alors qu'il s'agit du même métier que la FAQ : ce que l’assistant répond quand vous
 * n'êtes pas là. Les deux sont réunis sur /parametres/reponses.
 */
export function BusinessHoursCard() {
  const [hoursStart, setHoursStart] = useState("");
  const [hoursEnd, setHoursEnd] = useState("");
  const [timezone, setTimezone] = useState("Africa/Abidjan");
  const [awayMessage, setAwayMessage] = useState("");
  const [saveError, setSaveError] = useState<UserError | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const utils = api.useUtils();
  const { data, isLoading } = api.settings.getBusinessConfig.useQuery();
  const hasInitialSync = useRef(false);

  useEffect(() => {
    if (!data || hasInitialSync.current) return;
    hasInitialSync.current = true;
    setHoursStart(data.businessHoursStart ?? "");
    setHoursEnd(data.businessHoursEnd ?? "");
    setTimezone(data.businessTimezone ?? "Africa/Abidjan");
    setAwayMessage(data.awayMessage ?? "");
  }, [data]);

  const saveConfig = api.settings.setBusinessConfig.useMutation({
    onSuccess: () => {
      setSaveError(null);
      setSaveSuccess(true);
      void utils.settings.getBusinessConfig.invalidate();
      setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (e) => setSaveError(formatError(e, "whatsapp")),
  });

  const handleSave = () => {
    saveConfig.mutate({
      businessHoursStart: hoursStart || null,
      businessHoursEnd: hoursEnd || null,
      businessTimezone: timezone || null,
      awayMessage: awayMessage.trim() || null,
    });
  };

  const disabled = isLoading || saveConfig.isPending;

  return (
    <Card className="rounded-xl border border-border bg-card shadow-sm">
      <CardHeader className="border-b border-border pb-6">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Clock className="size-5 text-muted-foreground" />
          Vos horaires
        </CardTitle>
        <CardDescription>
          En dehors de ces horaires, votre message d’absence part automatiquement
          d’absence dès leur premier message.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-end gap-4">
          <TimePickerField
            label="Ouverture"
            value={hoursStart}
            onChange={setHoursStart}
            disabled={disabled}
          />
          <TimePickerField
            label="Fermeture"
            value={hoursEnd}
            onChange={setHoursEnd}
            disabled={disabled}
          />
          <div className="min-w-[200px] flex-1">
            {/* Label associé au déclencheur : sans `htmlFor`/`id`, le sélecteur
                n'avait aucun nom accessible. */}
            <label className={fieldLabel} htmlFor="business-hours-timezone">
              Fuseau horaire
            </label>
            <Select value={timezone} onValueChange={setTimezone} disabled={disabled}>
              <SelectTrigger
                id="business-hours-timezone"
                className="h-9 w-full border-border bg-muted/50"
              >
                <SelectValue placeholder="Choisir…" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label
            htmlFor="away-message"
            className={cn(fieldLabel, "flex items-center gap-1.5")}
          >
            <MessageSquare className="size-3.5" />
            Message d’absence
          </label>
          <Textarea
            id="away-message"
            value={awayMessage}
            onChange={(e) => setAwayMessage(e.target.value)}
            placeholder="Ex : Bonjour ! La boutique est fermée pour le moment. On ouvre à 8h et on te répond dès notre retour."
            rows={4}
            maxLength={2000}
            disabled={disabled}
            className="mt-1.5 resize-none border-border bg-muted/50"
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {awayMessage.length}/2000
          </p>
        </div>

        {saveError && <ErrorAlert error={saveError} />}
        {saveSuccess && (
          <Alert className="border-success/50 bg-success/10 text-success [&>svg]:text-success">
            <AlertDescription>Vos horaires sont enregistrés.</AlertDescription>
          </Alert>
        )}

        <Button
          type="button"
          onClick={handleSave}
          disabled={disabled}
          className="min-h-11 w-full font-semibold sm:w-auto"
        >
          {saveConfig.isPending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </CardContent>
    </Card>
  );
}
