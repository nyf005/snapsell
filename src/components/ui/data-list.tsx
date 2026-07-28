"use client";

import * as React from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { cn } from "~/lib/utils";

/**
 * Liste de données rendue en **deux compositions complètes** — principe 4 de PRODUCT.md :
 * « Mobile et desktop sont deux compositions complètes. Aucune action critique ne dépend
 * d'un grand écran ou du survol. »
 *
 *   ≥ md  → le tableau habituel, visuellement inchangé.
 *   < md  → des cartes empilées, sans défilement horizontal, actions ≥ 44 px.
 *
 * Une seule définition de colonnes alimente les deux, et le même nœud `empty` s'affiche
 * dans les deux branches — c'est ce qui évite que les états vides divergent.
 *
 * Le rôle de chaque colonne pilote sa place sur mobile :
 *   primary        → la ligne de titre de la carte
 *   secondary      → la valeur mise en avant, à droite du titre
 *   meta           → une paire « libellé : valeur »
 *   hiddenOnMobile → absente de la carte (détail secondaire)
 */

export type DataListColumnRole = "primary" | "secondary" | "meta" | "hiddenOnMobile";

export type DataListColumn<T> = {
  /** Identifiant stable de la colonne. */
  id: string;
  /**
   * En-tête de colonne, et libellé de la paire sur mobile.
   * Accepte un nœud pour héberger un contrôle — une case « tout sélectionner »,
   * par exemple. Réservez-le aux colonnes `hiddenOnMobile` : sur mobile l'en-tête
   * sert de libellé, un contrôle y serait dupliqué à chaque carte.
   */
  header: React.ReactNode;
  cell: (item: T) => React.ReactNode;
  role?: DataListColumnRole;
  /** Classe appliquée à la cellule du tableau (alignement, largeur…). */
  className?: string;
  /** Classe appliquée à l'en-tête du tableau. */
  headerClassName?: string;
};

export type DataListProps<T> = {
  items: readonly T[];
  getKey: (item: T) => string;
  columns: DataListColumn<T>[];
  /** Actions par ligne. Pleine largeur sur mobile. */
  actions?: (item: T) => React.ReactNode;
  /** Affiché à l'identique dans les deux compositions quand `items` est vide. */
  empty?: React.ReactNode;
  /** Libellé accessible de la liste sur mobile. */
  label?: string;
  className?: string;
  /** Largeur minimale du tableau desktop, si les colonnes sont serrées. */
  tableMinWidth?: string;
};

export function DataList<T>({
  items,
  getKey,
  columns,
  actions,
  empty,
  label,
  className,
  tableMinWidth,
}: DataListProps<T>) {
  const isEmpty = items.length === 0;
  const colSpan = columns.length + (actions ? 1 : 0);

  const mobileColumns = columns.filter((c) => c.role !== "hiddenOnMobile");
  const primary = mobileColumns.find((c) => c.role === "primary") ?? mobileColumns[0];
  const secondary = mobileColumns.find((c) => c.role === "secondary");
  const metaColumns = mobileColumns.filter((c) => c !== primary && c !== secondary);

  return (
    <div className={className}>
      {/* Desktop — le tableau existant. */}
      <div className="hidden md:block">
        <div className="overflow-x-auto">
          <Table className={tableMinWidth}>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.id} className={column.headerClassName}>
                    {column.header}
                  </TableHead>
                ))}
                {actions && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isEmpty ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="px-6 py-12">
                    {empty}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={getKey(item)}>
                    {columns.map((column) => (
                      <TableCell key={column.id} className={column.className}>
                        {column.cell(item)}
                      </TableCell>
                    ))}
                    {actions && (
                      <TableCell className="text-right">{actions(item)}</TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile — cartes empilées, jamais de défilement horizontal. */}
      <div className="md:hidden">
        {isEmpty ? (
          <div className="p-4">{empty}</div>
        ) : (
          <ul aria-label={label} className="divide-y divide-border">
            {items.map((item) => (
              <li key={getKey(item)} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  {primary && (
                    <div className="min-w-0 flex-1 font-semibold text-foreground">
                      {primary.cell(item)}
                    </div>
                  )}
                  {secondary && (
                    <div className="shrink-0 text-right font-semibold tabular-nums text-foreground">
                      {secondary.cell(item)}
                    </div>
                  )}
                </div>

                {metaColumns.length > 0 && (
                  <dl className="mt-2 space-y-1">
                    {metaColumns.map((column) => (
                      <div key={column.id} className="flex gap-2 text-sm">
                        <dt className="shrink-0 text-muted-foreground">{column.header} :</dt>
                        <dd className="min-w-0 text-foreground">{column.cell(item)}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {actions && (
                  <div
                    className={cn(
                      "mt-3 flex flex-wrap gap-2",
                      // Cibles tactiles ≥ 44 px, comme l'exige PRODUCT.md § Accessibilité.
                      "[&_button]:min-h-11 [&_a]:min-h-11",
                    )}
                  >
                    {actions(item)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
