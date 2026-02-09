import {
  CheckCircle2,
  MessageCircle,
  Rocket,
  CreditCard,
} from "lucide-react";

import { AnimateEntrance } from "~/app/_components/landing/animate-on-scroll";

export function AuthValuePanel() {
  return (
    <div className="hidden lg:flex flex-1 bg-primary/10 dark:bg-card items-center justify-center p-16 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-primary/20 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] bg-primary/10 rounded-full blur-3xl" />
      <div className="relative z-10 max-w-[500px] w-full flex flex-col gap-10">
        <AnimateEntrance delay={200} animation="scale-in">
          <div className="rounded-xl overflow-hidden shadow-2xl bg-card border border-border">
            <div
              className="h-[300px] bg-cover bg-center"
              style={{
                backgroundImage: `url("https://lh3.googleusercontent.com/aida-public/AB6AXuD940ndXk1uIthhxptUGijiFz7EIE06i6sDXnkUzdifztlsaMd5PsdD-gsf0XiQHF27qlIZTv1eEpAHH7yxzqTWqto8v8t6kWVWOCmdFxR5mDfSYoRbKOuVJbpxY6YZu7aXhlay8Kkg_MMgVRJQcX3JOdwmhBFt1NrdHL0U-b3Hdov_X3TAskH4O3NRcDdNlXoWyFUfdenqtOM01WIIEXp1NtLmT2C1XNFX2FjCK_CowMx5Nm5lRGLsmenpeLjpL5Ha0gPvmDrKgKg")`,
              }}
            />
            <div className="p-8 flex flex-col gap-6">
              <div className="flex items-start gap-4">
                <div className="bg-primary/20 p-3 rounded-lg">
                  <Rocket className="text-primary size-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">
                    Passez à l&apos;automatisation
                  </h3>
                  <p className="mt-1 text-muted-foreground">
                    Gagnez du temps en automatisant la prise de commandes et la
                    gestion des réservations.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2 p-4 rounded-lg bg-muted border border-border transition-all duration-300 hover:border-primary/40 hover:shadow-md">
                  <CreditCard className="text-primary size-5" />
                  <h4 className="font-bold text-sm">Tarification dynamique</h4>
                  <p className="text-xs text-muted-foreground">
                    Prix en temps réel selon les niveaux de stock.
                  </p>
                </div>
                <div className="flex flex-col gap-2 p-4 rounded-lg bg-muted border border-border transition-all duration-300 hover:border-primary/40 hover:shadow-md">
                  <MessageCircle className="text-primary size-5" />
                  <h4 className="font-bold text-sm">WhatsApp natif</h4>
                  <p className="text-xs text-muted-foreground">
                    Intégration directe avec l&apos;API WhatsApp Business.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </AnimateEntrance>

        <div className="flex flex-col gap-4">
          {[
            "Aucune carte bancaire requise pour commencer",
            "Mise en place de la boutique en 2 minutes",
            "Équipe support dédiée 24 h/24, 7 j/7",
          ].map((text, i) => (
            <AnimateEntrance key={text} delay={500 + i * 150}>
              <div className="flex items-center gap-4 text-muted-foreground">
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
