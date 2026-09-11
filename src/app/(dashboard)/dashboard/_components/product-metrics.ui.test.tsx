import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const state = vi.hoisted(() => ({ data: undefined as Record<string, unknown> | undefined, error: null as Error | null, refetch: vi.fn() }));
vi.mock("~/trpc/react", () => ({ api: { dashboard: { getProductMetrics: { useQuery: () => ({ ...state, isLoading: false, isFetching: false }) } } } }));
import { ProductMetrics } from "./product-metrics";
beforeEach(() => { state.data = undefined; state.error = null; vi.clearAllMocks(); });
it("différencie les données absentes d'un taux nul", () => {
  state.data = { conversionPercent: 0, converted: 0, reservations: 3, handoffPercent: null, conversations: 0, handedOff: 0, firstConfirmationSeconds: null, preparationSeconds: null, preparationSamples: 0 };
  render(<ProductMetrics />);
  expect(screen.getByText("0 %")).toBeVisible();
  expect(screen.getAllByText("Pas encore mesuré")).toHaveLength(3);
});
it("permet de reprendre une requête échouée", async () => {
  state.error = new Error("offline");
  render(<ProductMetrics />);
  await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  expect(state.refetch).toHaveBeenCalledOnce();
});
