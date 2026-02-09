import { redirect } from "next/navigation";

/** Story 6.6: Réservations = alias vers Live Ops (un seul point d'entrée). */
export default function ReservationsPage() {
  redirect("/dashboard/live");
}
