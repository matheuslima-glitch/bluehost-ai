/**
 * Silenciador de logs em produção
 * Importar este arquivo no main.tsx para ativar
 */

const isDevelopment = import.meta.env.DEV;

if (!isDevelopment) {
  console.log('🔒 Modo produção: Logs sensíveis desabilitados');

  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;

  // Lista de padrões que devem ser bloqueados
  const blockedPatterns = [
    'Supabase',
    'AuthContext',
    'canAccessPage',
    'usePermissions',
    'auth mudou',
    'Estado de auth',
    'SIGNED_IN',
    'SIGNED_OUT',
    'USER_UPDATED',
    'TOKEN_REFRESHED',
    'Sessão inicial',
    'Carregamento inicial',
    'Iniciando verificação',
    'Profile encontrado',
    'Permissões encontradas',
    'Buscando permissões',
    '@supabase',
    'email na sessão',
    'User ID:',
    'is_admin'
  ];

  const shouldBlock = (message: string): boolean => {
    return blockedPatterns.some(pattern => 
      message.toLowerCase().includes(pattern.toLowerCase())
    );
  };

  console.log = (...args: any[]) => {
    const message = args[0]?.toString() || '';
    if (shouldBlock(message)) {
      return; // Bloquear log
    }
    originalLog.apply(console, args);
  };

  console.info = (...args: any[]) => {
    const message = args[0]?.toString() || '';
    if (shouldBlock(message)) {
      return;
    }
    originalInfo.apply(console, args);
  };

  console.warn = (...args: any[]) => {
    const message = args[0]?.toString() || '';
    if (shouldBlock(message)) {
      return;
    }
    originalWarn.apply(console, args);
  };

  // Manter console.error para bugs reais
  // NÃO modificar console.error
}

export {};
