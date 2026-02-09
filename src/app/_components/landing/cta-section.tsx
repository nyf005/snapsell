import Link from "next/link";

import { Button } from "~/components/ui/button";
import { AnimateOnScroll } from "~/app/_components/landing/animate-on-scroll";

export function CtaSection() {
  return (
    <section className="px-6 py-24">
      <AnimateOnScroll animation="scale-in">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-primary p-12 text-center shadow-2xl shadow-primary/20 lg:p-20">
          {/* Decorative gradient overlay */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.2)_0%,_transparent_60%)]"
          />

          <h2 className="relative z-10 mb-8 text-3xl font-extrabold text-primary-foreground lg:text-5xl">
            Prêt à simplifier vos ventes ?
          </h2>
          <p className="relative z-10 mx-auto mb-12 max-w-2xl text-lg text-primary-foreground/80">
            Créez votre compte en 2 minutes et commencez à automatiser vos
            ventes WhatsApp dès votre prochain live.
          </p>

          <div className="relative z-10 flex flex-col justify-center gap-4 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-xl bg-white px-8 text-base font-bold text-[var(--primary)] transition-transform hover:scale-[1.03] hover:bg-white/90 active:scale-[0.98]"
            >
              <Link href="/login?tab=signup">
                Commencer l&apos;essai gratuit
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 rounded-xl border border-white/30 bg-white/10 px-8 text-base font-bold text-white backdrop-blur-md transition-transform hover:scale-[1.03] hover:bg-white/20 active:scale-[0.98]"
            >
              <Link href="/login">Se connecter</Link>
            </Button>
          </div>
        </div>
      </AnimateOnScroll>
    </section>
  );
}
