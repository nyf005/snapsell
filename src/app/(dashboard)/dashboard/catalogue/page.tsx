import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { CatalogueListContent } from "./_components/catalogue-list-content";

export default async function CataloguePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return <CatalogueListContent />;
}
