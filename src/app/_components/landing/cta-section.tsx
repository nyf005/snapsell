import Link from "next/link";
import { marketing } from "~/lib/copy/marketing";

import { Button } from "~/components/ui/button";
import { AnimateOnScroll } from "~/app/_components/landing/animate-on-scroll";

export function CtaSection() {
  return (
    <section className="px-6 py-24 lg:py-32">
      <AnimateOnScroll animation="scale-in">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-primary p-12 text-center shadow-2xl shadow-primary/20 lg:p-20">
          {/* Decorative gradient overlay */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.2)_0%,_transparent_60%)]"
          />

          <h2 className="relative z-10 mb-8 text-3xl font-extrabold text-primary-foreground lg:text-5xl">
            Votre prochaine commande, notée toute seule
          </h2>
          <p className="relative z-10 mx-auto mb-12 max-w-2xl text-lg text-primary-foreground/80">
            Créez votre boutique, connectez votre numéro WhatsApp actuel.{" "}
            {marketing.promise.setup}.
          </p>

          <div className="relative z-10 flex flex-col justify-center gap-4 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-xl bg-primary-foreground px-8 text-base font-bold text-primary transition-transform hover:scale-[1.03] hover:bg-primary-foreground/90 active:scale-[0.98]"
            >
              <Link href="/login?tab=signup">
                {marketing.cta.signup}
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 rounded-xl border border-primary-foreground/30 bg-primary-foreground/10 px-8 text-base font-bold text-primary-foreground backdrop-blur-md transition-transform hover:scale-[1.03] hover:bg-primary-foreground/20 hover:text-primary-foreground active:scale-[0.98]"
            >
              <Link href="/login">Se connecter</Link>
            </Button>
          </div>
        </div>
      </AnimateOnScroll>
    </section>
  );
}
