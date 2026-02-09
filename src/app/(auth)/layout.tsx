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
        <div className="flex-1 flex items-center justify-center p-8 md:p-16">
          {children}
        </div>
        <AuthValuePanel />
      </main>
      <AuthFooter />
    </div>
  );
}
