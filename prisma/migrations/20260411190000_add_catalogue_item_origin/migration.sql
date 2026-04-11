CREATE TYPE "CatalogueItemOrigin" AS ENUM ('live', 'seller_whatsapp', 'dashboard');

ALTER TABLE "catalogue_items"
ADD COLUMN "origin" "CatalogueItemOrigin" NOT NULL DEFAULT 'dashboard';

UPDATE "catalogue_items"
SET "origin" = CASE
  WHEN "created_in_live" = true THEN 'live'::"CatalogueItemOrigin"
  ELSE 'dashboard'::"CatalogueItemOrigin"
END;
