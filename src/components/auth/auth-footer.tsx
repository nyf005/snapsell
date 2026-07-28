import { marketing } from "~/lib/copy/marketing";

export function AuthFooter() {
  return (
    <footer className="px-6 py-6 md:px-10 border-t border-border bg-background text-center text-muted-foreground text-xs">
      <p>
        {marketing.footer.copyright}
      </p>
    </footer>
  );
}
