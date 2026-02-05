import {
  CheckCircle2,
  MessageCircle,
  Rocket,
  CreditCard,
} from "lucide-react";

export function AuthValuePanel() {
  return (
    <div className="hidden lg:flex flex-1 bg-primary/10 dark:bg-[#182634] items-center justify-center p-16 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-primary/20 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] bg-primary/10 rounded-full blur-3xl" />
      <div className="relative z-10 max-w-[500px] w-full flex flex-col gap-10">
        <div className="rounded-xl overflow-hidden shadow-2xl bg-white dark:bg-[#101922] border border-slate-200 dark:border-white/5">
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
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  Passez à l&apos;automatisation
                </h3>
                <p className="mt-1 text-slate-600 dark:text-slate-400">
                  Gagnez du temps en automatisant la prise de commandes et la gestion des réservations.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2 p-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5">
                <CreditCard className="text-primary size-5" />
                <h4 className="font-bold text-sm">Tarification dynamique</h4>
                <p className="text-xs text-slate-500">
                  Prix en temps réel selon les niveaux de stock.
                </p>
              </div>
              <div className="flex flex-col gap-2 p-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5">
                <MessageCircle className="text-primary size-5" />
                <h4 className="font-bold text-sm">WhatsApp natif</h4>
                <p className="text-xs text-slate-500">
                  Intégration directe avec l&apos;API WhatsApp Business.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4 text-slate-600 dark:text-slate-400">
            <CheckCircle2 className="size-5 shrink-0 text-green-500" />
            <span className="text-sm">Aucune carte bancaire requise pour commencer</span>
          </div>
          <div className="flex items-center gap-4 text-slate-600 dark:text-slate-400">
            <CheckCircle2 className="size-5 shrink-0 text-green-500" />
            <span className="text-sm">Mise en place de la boutique en 2 minutes</span>
          </div>
          <div className="flex items-center gap-4 text-slate-600 dark:text-slate-400">
            <CheckCircle2 className="size-5 shrink-0 text-green-500" />
            <span className="text-sm">Équipe support dédiée 24 h/24, 7 j/7</span>
          </div>
        </div>
      </div>
    </div>
  );
}
