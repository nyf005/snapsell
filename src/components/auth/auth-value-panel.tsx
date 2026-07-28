import { BarChart3, Layers, Zap } from "lucide-react";
import { marketing } from "~/lib/copy/marketing";

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
] as const;

export function AuthValuePanel() {
  return (
    <div className="relative hidden flex-1 items-center justify-center overflow-hidden bg-primary/10 px-16 py-6 lg:flex dark:bg-card">
      {/* Ambient glows */}
      <div className="absolute -top-[10%] -right-[10%] size-[400px] rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute -bottom-[10%] -left-[10%] size-[300px] rounded-full bg-primary/10 blur-3xl" />

      <div className="relative z-10 flex w-full max-w-[480px] flex-col gap-5">
        <AnimateEntrance delay={100}>
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl font-extrabold leading-tight tracking-tight">
              Gérez. Vendez. Développez.
              <br />
              <span className="text-primary">Tout depuis SnapSell.</span>
            </h2>
            <p className="text-muted-foreground">
              La plateforme des boutiques qui vendent sur WhatsApp et veulent
              arrêter de tout noter à la main.
            </p>
          </div>
        </AnimateEntrance>

        <AnimateEntrance delay={200} animation="scale-in">
          {/* Aperçu d'une conversation */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border bg-primary/10 px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  B
                </div>
                <div>
                  <p className="text-sm font-bold">{marketing.demo.shopName}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-green-500" />
                    <p className="text-xs text-muted-foreground">En ligne</p>
                  </div>
                </div>
              </div>
              {/* Compteurs du jour */}
              <div className="text-right">
                <p className="text-xs font-bold text-primary">42 réservations</p>
                <p className="text-xs text-muted-foreground">aujourd’hui</p>
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

          </div>
        </AnimateEntrance>

        {/*
          Ces trois lignes étaient des gages de confiance interchangeables, dont
          une quatrième promesse de délai concurrente (« en 2 minutes »). Elles
          disent maintenant ce que la personne obtient, titre par titre.

          Masquées sur les écrans courts : la page ne doit pas défiler, et ce
          bloc est le seul contenu du panneau dont on peut se passer — la
          conversation au-dessus porte déjà la démonstration.
        */}
        <div className="flex flex-col gap-4 [@media(max-height:860px)]:hidden">
          {[
            {
              icon: Layers,
              title: "Centralisez vos ventes",
              text: "Commandes, preuves de paiement et messages au même endroit.",
            },
            {
              icon: Zap,
              title: "Gagnez du temps",
              text: "L’assistant réserve, relance et enregistre pendant que vous vendez.",
            },
            {
              icon: BarChart3,
              title: "Suivez votre activité",
              text: "Ce qui est payé, ce qui reste à expédier, ce qui a expiré.",
            },
          ].map(({ icon: Icon, title, text }, i) => (
            <AnimateEntrance key={title} delay={500 + i * 150}>
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="size-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold">{title}</p>
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
              </div>
            </AnimateEntrance>
          ))}
        </div>
      </div>
    </div>
  );
}
