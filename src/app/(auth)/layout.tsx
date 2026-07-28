import { AuthFooter } from "~/components/auth/auth-footer";
import { SiteHeader } from "~/components/site-header";
import { AuthValuePanel } from "~/components/auth/auth-value-panel";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background">
      <SiteHeader variant="auth" />
      <main className="flex flex-1 flex-col md:flex-row items-stretch overflow-hidden">
        {/*
          `py-8` plutôt que `p-16` : la page ne doit pas défiler, et 64px de
          marge haute et basse coûtaient à eux seuls la moitié du dépassement.
        */}
        <div className="flex-1 flex items-center justify-center px-6 py-8 md:px-16">
          {children}
        </div>
        <AuthValuePanel />
      </main>
      <AuthFooter />
    </div>
  );
}
