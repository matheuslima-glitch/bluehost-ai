import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type PermissionLevel = "none" | "read" | "write";

export interface UserPermissions {
  permission_type: "total" | "personalizado";

  // Acesso por Aba
  can_access_dashboard: PermissionLevel;
  can_access_domain_search: PermissionLevel;
  can_access_management: PermissionLevel;
  can_access_settings: PermissionLevel;

  // Dashboard
  can_view_critical_domains: PermissionLevel;
  can_view_integrations: PermissionLevel;
  can_view_balance: PermissionLevel;

  // Compra de Domínios
  can_manual_purchase: PermissionLevel;
  can_ai_purchase: PermissionLevel;

  // Gerenciamento
  can_view_domain_details: PermissionLevel;
  can_change_domain_status: PermissionLevel;
  can_select_platform: PermissionLevel;
  can_select_traffic_source: PermissionLevel;
  can_insert_funnel_id: PermissionLevel;
  can_view_logs: PermissionLevel;
  can_change_nameservers: PermissionLevel;

  // Configurações
  can_create_filters: PermissionLevel;
  can_manage_users: PermissionLevel;

  is_admin: boolean;
}

export function usePermissions() {
  const { user } = useAuth();

  const { data: permissions, isLoading } = useQuery({
    queryKey: ["user-permissions", user?.id],
    queryFn: async () => {
      // Buscar se é admin
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user?.id)
        .single();

      if (profileError) throw profileError;

      // Se é admin, tem todas as permissões em nível "write"
      if (profile.is_admin) {
        return {
          permission_type: "total",
          can_access_dashboard: "write",
          can_access_domain_search: "write",
          can_access_management: "write",
          can_access_settings: "write",
          can_view_critical_domains: "write",
          can_view_integrations: "write",
          can_view_balance: "write",
          can_manual_purchase: "write",
          can_ai_purchase: "write",
          can_view_domain_details: "write",
          can_change_domain_status: "write",
          can_select_platform: "write",
          can_select_traffic_source: "write",
          can_insert_funnel_id: "write",
          can_view_logs: "write",
          can_change_nameservers: "write",
          can_create_filters: "write",
          can_manage_users: "write",
          is_admin: true,
        } as UserPermissions;
      }

      // Buscar permissões do usuário
      const { data: userPermissions, error: permissionsError } = await supabase
        .from("user_permissions")
        .select("*")
        .eq("user_id", user?.id)
        .single();

      if (permissionsError) {
        // Se não tem permissões, retornar permissões padrão (acesso total mas não admin)
        return {
          permission_type: "total",
          can_access_dashboard: "write",
          can_access_domain_search: "write",
          can_access_management: "write",
          can_access_settings: "read",
          can_view_critical_domains: "write",
          can_view_integrations: "read",
          can_view_balance: "read",
          can_manual_purchase: "write",
          can_ai_purchase: "write",
          can_view_domain_details: "write",
          can_change_domain_status: "write",
          can_select_platform: "write",
          can_select_traffic_source: "write",
          can_insert_funnel_id: "write",
          can_view_logs: "read",
          can_change_nameservers: "write",
          can_create_filters: "write",
          can_manage_users: "none",
          is_admin: false,
        } as UserPermissions;
      }

      return {
        ...userPermissions,
        is_admin: false,
      } as UserPermissions;
    },
    enabled: !!user?.id,
  });

  // Verificar se tem permissão (read ou write)
  const hasPermission = (permission: keyof UserPermissions): boolean => {
    if (!permissions) return false;
    if (permissions.is_admin) return true;

    const level = permissions[permission];
    // Considera que tem permissão se for "read" ou "write"
    return level === "read" || level === "write";
  };

  // Verificar se pode editar (somente write)
  const canEdit = (permission: keyof UserPermissions): boolean => {
    if (!permissions) return false;
    if (permissions.is_admin) return true;

    const level = permissions[permission];
    return level === "write";
  };

  // Verificar acesso a páginas
  const canAccessPage = (page: "dashboard" | "domain-search" | "management" | "settings"): boolean => {
    if (!permissions) return false;
    if (permissions.is_admin) return true;

    switch (page) {
      case "dashboard":
        return permissions.can_access_dashboard !== "none";
      case "domain-search":
        return permissions.can_access_domain_search !== "none";
      case "management":
        return permissions.can_access_management !== "none";
      case "settings":
        return permissions.can_access_settings !== "none";
      default:
        return false;
    }
  };

  return {
    permissions,
    isLoading,
    hasPermission, // Pode ver (read ou write)
    canEdit, // Pode editar (apenas write)
    canAccessPage,
    isAdmin: permissions?.is_admin || false,
  };
}
