import { Home, Search, Globe, Settings, LogOut } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const menuItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Compra de Domínios", url: "/search", icon: Search },
  { title: "Gerenciamento", url: "/domains", icon: Globe },
  { title: "Configurações", url: "/settings", icon: Settings },
];

// Função para extrair nome e sobrenome do email
const getNameFromEmail = (email: string | undefined) => {
  if (!email) return "Usuário";

  const namePart = email.split("@")[0];
  const names = namePart.split(".");

  if (names.length >= 2) {
    const firstName = names[0].charAt(0).toUpperCase() + names[0].slice(1);
    const lastName = names[1].charAt(0).toUpperCase() + names[1].slice(1);
    return `${firstName} ${lastName}`;
  }

  return namePart.charAt(0).toUpperCase() + namePart.slice(1);
};

// Função para obter iniciais do nome
const getInitials = (name: string) => {
  const parts = name.split(" ");
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

export function AppSidebar() {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const userName = getNameFromEmail(user?.email);
  const userInitials = getInitials(userName);

  return (
    <Sidebar className="border-r-0" collapsible="icon">
      {/* Header - Logo e Nome */}
      <SidebarHeader className="border-b-0 p-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <Globe className="h-5 w-5 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-lg truncate">DomainHub</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      {/* Menu Principal */}
      <SidebarContent className="px-3 py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {menuItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={isCollapsed ? item.title : undefined} className="h-10">
                      <NavLink
                        to={item.url}
                        className={
                          isActive
                            ? "bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50"
                            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }
                      >
                        <item.icon className="h-5 w-5" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer - Usuário e Logout */}
      <SidebarFooter className="border-t-0 p-3">
        {isCollapsed ? (
          <div className="flex flex-col gap-2 items-center w-full">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" title={userName}>
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-lg text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
              onClick={signOut}
              title="Sair"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-3 px-2 py-1">
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col overflow-hidden min-w-0">
                <span className="text-sm font-medium truncate">{userName}</span>
                <span className="text-xs text-muted-foreground">Usuário ativo</span>
              </div>
            </div>
            <Button variant="outline" className="w-full justify-start h-9 text-sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
