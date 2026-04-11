export type CatalogueItemOriginValue = "live" | "seller_whatsapp" | "dashboard";

export function getCatalogueOriginLabel(origin: CatalogueItemOriginValue): string {
  switch (origin) {
    case "live":
      return "Live";
    case "seller_whatsapp":
      return "WhatsApp";
    case "dashboard":
      return "Manuel";
    default: {
      const exhaustiveCheck: never = origin;
      return exhaustiveCheck;
    }
  }
}

export function isLiveCatalogueOrigin(origin: CatalogueItemOriginValue): boolean {
  return origin === "live";
}
