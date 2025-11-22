import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface UserPermissions {
  permission_type: "total" | "personalizado";
  can_access_dashboard: boolean;
  can_access_domain_search: boolean;
  can_access_management: boolean;
  can_access_settings: boolean;
  can_view_critical_domains: boolean;
  can_view_integrations: boolean;
  can_view_balance: boolean;
  can_manual_purchase: boolean;
  can_ai_purchase: boolean;
  can_view_domain_details: boolean;
  can_change_domain_status: boolean;
  can_select_platform: boolean;
  can_select_traffic_source: boolean;
  can_insert_funnel_id: boolean;
  can_view_logs: boolean;
  can_change_nameservers: boolean;
  can_create_filters: boolean;
  can_manage_users: boolean;
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

      // Se é admin, tem todas as permissões
      if (profile.is_admin) {
        return {
          permission_type: "total",
          can_access_dashboard: true,
          can_access_domain_search: true,
          can_access_management: true,
          can_access_settings: true,
          can_view_critical_domains: true,
          can_view_integrations: true,
          can_view_balance: true,
          can_manual_purchase: true,
          can_ai_purchase: true,
          can_view_domain_details: true,
          can_change_domain_status: true,
          can_select_platform: true,
          can_select_traffic_source: true,
          can_insert_funnel_id: true,
          can_view_logs: true,
          can_change_nameservers: true,
          can_create_filters: true,
          can_manage_users: true,
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
        // Se não tem permissões, retornar permissões padrão
        return {
          permission_type: "total",
          can_access_dashboard: true,
          can_access_domain_search: true,
          can_access_management: true,
          can_access_settings: false,
          can_view_critical_domains: true,
          can_view_integrations: true,
          can_view_balance: true,
          can_manual_purchase: true,
          can_ai_purchase: true,
          can_view_domain_details: true,
          can_change_domain_status: false,
          can_select_platform: false,
          can_select_traffic_source: false,
          can_insert_funnel_id: false,
          can_view_logs: true,
          can_change_nameservers: false,
          can_create_filters: false,
          can_manage_users: false,
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

  const hasPermission = (permission: keyof UserPermissions): boolean => {
    if (!permissions) return false;
    if (permissions.is_admin) return true;
    return permissions[permission] === true;
  };

  const canAccessPage = (page: "dashboard" | "domain-search" | "management" | "settings"): boolean => {
    if (!permissions) return false;
    if (permissions.is_admin) return true;

    switch (page) {
      case "dashboard":
        return permissions.can_access_dashboard;
      case "domain-search":
        return permissions.can_access_domain_search;
      case "management":
        return permissions.can_access_management;
      case "settings":
        return permissions.can_access_settings;
      default:
        return false;
    }
  };

  return {
    permissions,
    isLoading,
    hasPermission,
    canAccessPage,
    isAdmin: permissions?.is_admin || false,
  };
}
