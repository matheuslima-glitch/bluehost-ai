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
  can_send_invites: PermissionLevel;

  is_admin: boolean;
}

// Permissões padrão para admin (acesso total)
const ADMIN_PERMISSIONS: UserPermissions = {
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
  can_send_invites: "write",
  is_admin: true,
};

// Permissões padrão para usuário sem permissões definidas
const DEFAULT_USER_PERMISSIONS: UserPermissions = {
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
  can_send_invites: "none",
  is_admin: false,
};

export function usePermissions() {
  const { user } = useAuth();

  const {
    data: permissions,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["user-permissions", user?.id],
    queryFn: async (): Promise<UserPermissions> => {
      if (!user?.id) {
        throw new Error("Usuário não autenticado");
      }

      // Buscar se é admin
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error("Erro ao buscar perfil:", profileError);
        // Se não encontrar perfil, retornar permissões padrão
        return DEFAULT_USER_PERMISSIONS;
      }

      // Se é admin, tem todas as permissões em nível "write"
      if (profile?.is_admin) {
        return ADMIN_PERMISSIONS;
      }

      // Buscar permissões do usuário
      const { data: userPermissions, error: permissionsError } = await supabase
        .from("user_permissions")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (permissionsError) {
        console.log("Usuário sem permissões específicas, usando padrão");
        // Se não tem permissões, retornar permissões padrão
        return DEFAULT_USER_PERMISSIONS;
      }

      // Retornar permissões do banco com valores padrão para campos faltantes
      return {
        permission_type: userPermissions.permission_type || "total",
        can_access_dashboard: userPermissions.can_access_dashboard || "write",
        can_access_domain_search: userPermissions.can_access_domain_search || "write",
        can_access_management: userPermissions.can_access_management || "write",
        can_access_settings: userPermissions.can_access_settings || "read",
        can_view_critical_domains: userPermissions.can_view_critical_domains || "write",
        can_view_integrations: userPermissions.can_view_integrations || "read",
        can_view_balance: userPermissions.can_view_balance || "read",
        can_manual_purchase: userPermissions.can_manual_purchase || "write",
        can_ai_purchase: userPermissions.can_ai_purchase || "write",
        can_view_domain_details: userPermissions.can_view_domain_details || "write",
        can_change_domain_status: userPermissions.can_change_domain_status || "write",
        can_select_platform: userPermissions.can_select_platform || "write",
        can_select_traffic_source: userPermissions.can_select_traffic_source || "write",
        can_insert_funnel_id: userPermissions.can_insert_funnel_id || "write",
        can_view_logs: userPermissions.can_view_logs || "read",
        can_change_nameservers: userPermissions.can_change_nameservers || "write",
        can_create_filters: userPermissions.can_create_filters || "write",
        can_manage_users: userPermissions.can_manage_users || "none",
        can_send_invites: userPermissions.can_send_invites || "none",
        is_admin: false,
      };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
    retry: 2,
  });

  // Verificar se tem permissão (read ou write)
  const hasPermission = (permission: keyof UserPermissions): boolean => {
    if (isLoading) return false;
    if (!permissions) return false;
    if (permissions.is_admin) return true;

    const level = permissions[permission];
    if (typeof level === "boolean") return level;
    // Considera que tem permissão se for "read" ou "write"
    return level === "read" || level === "write";
  };

  // Verificar se pode editar (somente write)
  const canEdit = (permission: keyof UserPermissions): boolean => {
    if (isLoading) return false;
    if (!permissions) return false;
    if (permissions.is_admin) return true;

    const level = permissions[permission];
    if (typeof level === "boolean") return level;
    return level === "write";
  };

  // Verificar acesso a páginas
  const canAccessPage = (page: "dashboard" | "domain-search" | "management" | "settings"): boolean => {
    // Durante carregamento, permitir acesso para evitar flash de tela de erro
    if (isLoading) return true;
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

  // Verificar se pode editar em uma página específica
  const canEditPage = (page: "dashboard" | "domain-search" | "management" | "settings"): boolean => {
    if (isLoading) return false;
    if (!permissions) return false;
    if (permissions.is_admin) return true;

    switch (page) {
      case "dashboard":
        return permissions.can_access_dashboard === "write";
      case "domain-search":
        return permissions.can_access_domain_search === "write";
      case "management":
        return permissions.can_access_management === "write";
      case "settings":
        return permissions.can_access_settings === "write";
      default:
        return false;
    }
  };

  return {
    permissions,
    isLoading,
    error,
    hasPermission, // Pode ver (read ou write)
    canEdit, // Pode editar (apenas write)
    canAccessPage, // Pode acessar a página
    canEditPage, // Pode editar na página
    isAdmin: permissions?.is_admin || false,
  };
}
