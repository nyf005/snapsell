import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { ProofsListContent } from "./_components/proofs-list-content";

export default async function ProofsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return <ProofsListContent />;
}
