"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import * as React from "react";

import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Grid3X3,
  LayoutDashboard,
  MessageCircle,
  Package,
  ShoppingCart,
  Users,
  Zap,
  Radio,
  Clock,
  Settings,
} from "lucide-react";

import { SignOutButton } from "./sign-out-button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "~/components/ui/sidebar";
import { cn } from "~/lib/utils";

type MenuItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  requiresGridRole?: boolean;
};

type MenuGroup = {
  label: string;
  items: MenuItem[];
  requiresGridRole?: boolean;
  mainItem?: MenuItem; // Item principal du groupe (si différent du premier item)
};

const menuGroups: MenuGroup[] = [
  {
    label: "Principal",
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    ],
  },
  {
    label: "Commandes",
    mainItem: { href: "/dashboard/orders", label: "Commandes", icon: ShoppingCart },
    items: [
      { href: "/dashboard/orders", label: "Liste des commandes", icon: ShoppingCart },
      { href: "/dashboard/proofs", label: "Preuves d'acompte", icon: CheckCircle2 },
    ],
  },
  {
    label: "Live Ops",
    mainItem: { href: "/dashboard/live", label: "Live Ops", icon: Radio },
    items: [
      { href: "/dashboard/live", label: "Session live", icon: Radio },
      { href: "/dashboard/reservations", label: "Réservations", icon: Clock },
    ],
  },
  {
    label: "Paramètres",
    requiresGridRole: true,
    mainItem: { href: "/parametres", label: "Paramètres", icon: Settings, requiresGridRole: true },
    items: [
      { href: "/parametres", label: "Grille de prix", icon: Grid3X3, requiresGridRole: true },
      { href: "/parametres/livraison", label: "Frais de livraison", icon: Package, requiresGridRole: true },
      { href: "/parametres/whatsapp", label: "Connexion WhatsApp", icon: MessageCircle, requiresGridRole: true },
      { href: "/parametres/team", label: "Équipe", icon: Users, requiresGridRole: true },
    ],
  },
];

type AppSidebarProps = {
  userName: string;
  tenantName: string;
  canManageGrid: boolean;
};

export function AppSidebar({
  userName,
  tenantName,
  canManageGrid,
}: AppSidebarProps) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const isItemActive = (href: string, exactMatch = false) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    if (exactMatch) {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  const isGroupActive = (group: MenuGroup) => {
    return group.items.some((item) => isItemActive(item.href));
  };

  // Vérifier si un sous-item est actif dans un groupe
  const hasActiveSubItem = (group: MenuGroup, subMenuItems: MenuItem[]) => {
    return subMenuItems.some((item) => isItemActive(item.href, true));
  };

  const toggleGroup = (groupLabel: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupLabel)) {
        next.delete(groupLabel);
      } else {
        next.add(groupLabel);
      }
      return next;
    });
  };

  // Ouvrir automatiquement les groupes qui ont un item actif
  React.useEffect(() => {
    menuGroups.forEach((group) => {
      if (isGroupActive(group)) {
        setOpenGroups((prev) => new Set(prev).add(group.label));
      }
    });
  }, [pathname]);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard" className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg">
                  <Zap className="size-5" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-bold">SnapSell</span>
                  <span className="text-xs text-muted-foreground">
                    Tableau de bord vendeur
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <div className="flex flex-col gap-1">
          {menuGroups.map((group) => {
            // Filtrer les groupes selon les permissions
            if (group.requiresGridRole && !canManageGrid) {
              return null;
            }

            // Filtrer les items selon les permissions
            const visibleItems = group.items.filter(
              (item) => !item.requiresGridRole || canManageGrid
            );

            if (visibleItems.length === 0) {
              return null;
            }

            // Si un seul item, afficher directement sans dropdown
            if (visibleItems.length === 1) {
              const item = visibleItems[0]!;
              const isActive = isItemActive(item.href);
              const Icon = item.icon;
              return (
                <SidebarGroup key={group.label} className="py-0">
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                          <Link href={item.href}>
                            <Icon className="size-4" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            }

            // Plusieurs items = groupe avec sous-menu déroulant
            const groupActive = isGroupActive(group);
            const isOpen = openGroups.has(group.label);
            // Utiliser mainItem si défini, sinon le premier item
            const mainItem = group.mainItem && (!group.mainItem.requiresGridRole || canManageGrid)
              ? group.mainItem
              : visibleItems[0]!;
            const MainIcon = mainItem.icon;
            // Si mainItem est défini, tous les items sont dans le sous-menu, sinon on exclut le premier
            const subMenuItems = group.mainItem ? visibleItems : visibleItems.slice(1);
            
            // Le bouton principal est actif si un sous-item est actif OU si on est exactement sur sa route
            const hasActiveSub = hasActiveSubItem(group, subMenuItems);
            const mainItemActive = hasActiveSub || isItemActive(mainItem.href, true);

            return (
              <SidebarGroup key={group.label} className="py-0">
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <div className="flex flex-col w-full">
                        <div className="flex w-full items-center">
                          <SidebarMenuButton
                            asChild
                            isActive={mainItemActive}
                            tooltip={mainItem.label}
                            className="flex-1"
                          >
                            <Link href={mainItem.href}>
                              <MainIcon className="size-4" />
                              <span>{mainItem.label}</span>
                            </Link>
                          </SidebarMenuButton>
                          <button
                            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-accent-foreground transition-colors group-data-[collapsible=icon]:hidden"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleGroup(group.label);
                            }}
                            aria-label={isOpen ? "Fermer le menu" : "Ouvrir le menu"}
                          >
                            {isOpen ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </button>
                        </div>
                        {isOpen && subMenuItems.length > 0 && (
                          <div className="ml-4 mt-1 space-y-0.5 border-l border-sidebar-border pl-3 group-data-[collapsible=icon]:hidden">
                            {subMenuItems.map((item) => {
                              const isActive = isItemActive(item.href, true);
                              const Icon = item.icon;
                              return (
                                <Link
                                  key={item.href}
                                  href={item.href}
                                  className={cn(
                                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                                    isActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                  )}
                                >
                                  <Icon className="size-4" />
                                  <span>{item.label}</span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </div>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex w-full items-center gap-2 rounded-md p-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{userName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {tenantName}
                </p>
              </div>
              <SignOutButton className="shrink-0 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
