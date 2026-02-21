import { CheckCircle2, MessageCircle, Lock, TimerOff } from "lucide-react";

import { AnimateEntrance } from "~/app/_components/landing/animate-on-scroll";

const messages = [
  { from: "customer", text: "ABC12", time: "14:31" },
  {
    from: "bot",
    text: "✅ Réservé ! Robe fleurie S — 15 000 FCFA\nPaiement sous 30 min.",
    time: "14:31",
  },
  { from: "customer2", text: "XYZ98", time: "14:32" },
  {
    from: "bot",
    text: "✅ Réservé ! Sac bandoulière — 22 000 FCFA\nPaiement sous 30 min.",
    time: "14:32",
  },
  { from: "customer3", text: "DEF34", time: "14:33" },
  {
    from: "bot",
    text: "⏳ File d'attente — Sandales dorées\nVous serez notifiée si le stock revient.",
    time: "14:33",
  },
] as const;

export function AuthValuePanel() {
  return (
    <div className="relative hidden flex-1 items-center justify-center overflow-hidden bg-primary/10 p-16 lg:flex dark:bg-card">
      {/* Ambient glows */}
      <div className="absolute -top-[10%] -right-[10%] size-[400px] rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute -bottom-[10%] -left-[10%] size-[300px] rounded-full bg-primary/10 blur-3xl" />

      <div className="relative z-10 flex w-full max-w-[480px] flex-col gap-8">
        <AnimateEntrance delay={200} animation="scale-in">
          {/* Live session mock */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border bg-primary/10 px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  B
                </div>
                <div>
                  <p className="text-sm font-bold">Boutiquemode237</p>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-green-500" />
                    <p className="text-xs text-muted-foreground">Live en cours</p>
                  </div>
                </div>
              </div>
              {/* Live stats */}
              <div className="text-right">
                <p className="text-xs font-bold text-primary">42 réservations</p>
                <p className="text-xs text-muted-foreground">1 240 000 FCFA</p>
              </div>
            </div>

            {/* Chat feed */}
            <div className="flex flex-col gap-2.5 p-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.from !== "bot" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${
                      msg.from !== "bot"
                        ? "rounded-br-sm bg-primary/20"
                        : "rounded-bl-sm border border-border bg-muted"
                    }`}
                  >
                    <p className="whitespace-pre-line font-medium leading-snug">
                      {msg.text}
                    </p>
                    <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
                      {msg.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Feature pills */}
            <div className="grid grid-cols-2 gap-3 border-t border-border p-4">
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                <Lock className="size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-bold">Réservation auto</p>
                  <p className="text-[10px] text-muted-foreground">Stock verrouillé</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                <TimerOff className="size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-bold">Anti-fantômes</p>
                  <p className="text-[10px] text-muted-foreground">TTL 30 min</p>
                </div>
              </div>
            </div>
          </div>
        </AnimateEntrance>

        {/* Trust bullets */}
        <div className="flex flex-col gap-3">
          {[
            "Aucune carte bancaire requise pour commencer",
            "Mise en place de la boutique en 2 minutes",
            "Support WhatsApp dédié inclus",
          ].map((text, i) => (
            <AnimateEntrance key={text} delay={500 + i * 150}>
              <div className="flex items-center gap-3 text-muted-foreground">
                <CheckCircle2 className="size-5 shrink-0 text-success" />
                <span className="text-sm">{text}</span>
              </div>
            </AnimateEntrance>
          ))}
        </div>
      </div>
    </div>
  );
}
