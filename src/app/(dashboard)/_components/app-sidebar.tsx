"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import {
  CheckCircle2,
  CreditCard,
  Grid3X3,
  HelpCircle,
  LayoutDashboard,
  MessageCircle,
  Package,
  ShoppingCart,
  Users,
  Radio,
  Settings,
  ScrollText,
  PackageOpen,
} from "lucide-react";

import { SnapSellLogo } from "~/components/auth/snapsel-logo";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
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
import { cn, getInitials } from "~/lib/utils";

type MenuItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  requiresGridRole?: boolean;
};

type MenuGroup = {
  label: string;
  section: "Opérations" | "Ventes" | "Pilotage" | "Configuration";
  items: MenuItem[];
  requiresGridRole?: boolean;
  mainItem?: MenuItem; // Item principal du groupe (si différent du premier item)
};

type VisibleMenuGroup = Omit<MenuGroup, "items"> & {
  items: MenuItem[];
};

const menuGroups: MenuGroup[] = [
  {
    label: "Principal",
    section: "Opérations",
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    ],
  },
  {
    label: "Catalogue",
    section: "Opérations",
    items: [
      { href: "/dashboard/catalogue", label: "Catalogue", icon: PackageOpen },
    ],
  },
  {
    label: "Sessions Live",
    section: "Opérations",
    items: [
      { href: "/dashboard/live", label: "Sessions Live", icon: Radio },
    ],
  },
  {
    label: "Liste des commandes",
    section: "Ventes",
    items: [
      { href: "/dashboard/orders", label: "Liste des commandes", icon: ShoppingCart },
    ],
  },
  {
    label: "Preuves",
    section: "Ventes",
    items: [
      { href: "/dashboard/proofs", label: "Preuves", icon: CheckCircle2 },
    ],
  },
  {
    label: "Journal d'événements",
    section: "Pilotage",
    items: [
      { href: "/dashboard/audit", label: "Journal d'événements", icon: ScrollText },
    ],
  },
  {
    label: "Grille de prix",
    section: "Configuration",
    requiresGridRole: true,
    items: [
      { href: "/parametres", label: "Grille de prix", icon: Grid3X3, requiresGridRole: true },
    ],
  },
  {
    label: "Frais de livraison",
    section: "Configuration",
    requiresGridRole: true,
    items: [
      { href: "/parametres/livraison", label: "Frais de livraison", icon: Package, requiresGridRole: true },
    ],
  },
  {
    label: "Connexion WhatsApp",
    section: "Configuration",
    requiresGridRole: true,
    items: [
      { href: "/parametres/whatsapp", label: "Connexion WhatsApp", icon: MessageCircle, requiresGridRole: true },
    ],
  },
  {
    label: "Équipe",
    section: "Configuration",
    requiresGridRole: true,
    items: [
      { href: "/parametres/team", label: "Équipe", icon: Users, requiresGridRole: true },
    ],
  },
  {
    label: "Réponses FAQ",
    section: "Configuration",
    requiresGridRole: true,
    items: [
      { href: "/parametres/faq", label: "Réponses FAQ", icon: HelpCircle, requiresGridRole: true },
    ],
  },
  {
    label: "Abonnement",
    section: "Configuration",
    requiresGridRole: true,
    items: [
      { href: "/parametres/abonnement", label: "Abonnement", icon: CreditCard, requiresGridRole: true },
    ],
  },
];

const sectionOrder = [
  "Opérations",
  "Ventes",
  "Pilotage",
  "Configuration",
] as const;

type AppSidebarProps = {
  userName: string;
  tenantName: string;
  canManageGrid: boolean;
  showBranding: boolean;
};

export function AppSidebar({
  userName,
  tenantName,
  canManageGrid,
  showBranding,
}: AppSidebarProps) {
  const pathname = usePathname();

  const isItemActive = (href: string, exactMatch = false) => {
    // Pages racines : correspondance exacte uniquement pour éviter les faux positifs
    // Ex: /parametres ne doit pas être actif sur /parametres/whatsapp
    if (href === "/dashboard" || href === "/parametres") {
      return pathname === href;
    }
    if (exactMatch) {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  // Vérifier si un sous-item est actif dans un groupe
  const hasActiveSubItem = (subMenuItems: MenuItem[]) => {
    return subMenuItems.some((item) => isItemActive(item.href, true));
  };

  const visibleMenuGroups = React.useMemo<VisibleMenuGroup[]>(() => {
    return menuGroups
      .filter((group) => !group.requiresGridRole || canManageGrid)
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.requiresGridRole || canManageGrid),
      }))
      .filter((group) => group.items.length > 0);
  }, [canManageGrid]);

  const renderGroup = (group: VisibleMenuGroup) => {
    if (group.items.length === 1) {
      const item = group.items[0]!;
      const isActive = isItemActive(item.href);
      const Icon = item.icon;
      return (
        <SidebarGroup key={group.label} className="py-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.label}
                  className="h-10 rounded-md"
                >
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

    const mainItem =
      group.mainItem && (!group.mainItem.requiresGridRole || canManageGrid)
        ? group.mainItem
        : group.items[0]!;
    const MainIcon = mainItem.icon;
    const subMenuItems = group.mainItem ? group.items : group.items.slice(1);

    const hasActiveSub = hasActiveSubItem(subMenuItems);
    const mainItemActive = hasActiveSub || isItemActive(mainItem.href, true);

    return (
      <SidebarGroup key={group.label} className="py-0">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex w-full flex-col">
                <div className="flex w-full items-center">
                  <SidebarMenuButton
                    asChild
                    isActive={mainItemActive}
                    tooltip={mainItem.label}
                    className="h-10 flex-1 rounded-md"
                  >
                    <Link href={mainItem.href}>
                      <MainIcon className="size-4" />
                      <span>{mainItem.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </div>
                {subMenuItems.length > 0 && (
                  <div className="ml-4 mt-1 space-y-0.5 px-2 py-1 group-data-[collapsible=icon]:hidden">
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
                            isActive &&
                              "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
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
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="h-[65px] border-b border-sidebar-border px-2 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="h-auto rounded-md p-3">
              <Link href="/dashboard" className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
                <SnapSellLogo className="!size-8 shrink-0" />
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-bold">
                    Snap<span className="text-primary">Sell</span>
                  </span>
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
        <div className="flex flex-col pb-2 pt-3">
          {sectionOrder.map((section) => {
            const groupsInSection = visibleMenuGroups.filter((group) => group.section === section);
            if (groupsInSection.length === 0) {
              return null;
            }

            return (
              <div key={section} className="px-2 pt-3 first:pt-1">
                <div className="mb-1 px-2 group-data-[collapsible=icon]:sr-only">
                  <p className="text-xs font-medium text-muted-foreground">
                    {section}
                  </p>
                </div>
                <div className="space-y-0.5">
                  {groupsInSection.map((group) => renderGroup(group))}
                </div>
              </div>
            );
          })}
        </div>
      </SidebarContent>
      {showBranding && (
        <div className="px-4 py-2 text-center group-data-[collapsible=icon]:hidden">
          <p className="text-[10px] text-muted-foreground/60">
            Propulsé par{" "}
            <span className="font-semibold">
              Snap<span className="text-primary">Sell</span>
            </span>
          </p>
        </div>
      )}
      <SidebarFooter className="border-t border-sidebar-border px-2 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex w-full items-center gap-2 rounded-md p-2">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs">
                  {getInitials(userName)}
                </AvatarFallback>
              </Avatar>
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
