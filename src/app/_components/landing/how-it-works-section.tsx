const steps = [
  { title: "Créez votre catalogue", description: "Ajoutez vos articles, leurs codes, leurs prix et votre stock." },
  { title: "Connectez WhatsApp", description: "Connectez votre numéro, réglez vos réservations et activez l’assistant." },
  { title: "Recevez vos commandes", description: "Partagez vos codes articles. L’assistant prend les demandes en charge ; vous retrouvez les commandes dans SnapSell." },
];

export function HowItWorksSection() {
  return (
    <section className="bg-muted/40 px-5 py-16 sm:px-6 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Trois étapes pour démarrer</h2>
        <ol className="mt-10 grid gap-10 sm:mt-12 md:grid-cols-3 md:gap-10 lg:mt-16 lg:gap-14">{steps.map((step, index) => <li key={step.title} className="flex gap-5 md:flex-col md:gap-6"><span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">{index + 1}</span><div><h3 className="text-xl font-semibold leading-snug">{step.title}</h3><p className="mt-4 max-w-sm leading-7 text-muted-foreground">{step.description}</p></div></li>)}</ol>
      </div>
    </section>
  );
}
