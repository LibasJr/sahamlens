// Public API module user/ - satu-satunya yang boleh diimpor module/adapter lain.
// Jangan pernah import langsung dari modules/user/service/*, modules/user/repository/*
// dst dari luar module ini.

export { getSession, checkProAccess } from '../../shared/auth/session';
export type { SessionPayload } from '../../shared/auth/jwt';

export { isAdminServer, isAdminFromRequestCookies } from './service/admin.service';

export type { User, DemoSession } from './types/user.types';

export {
  handleLogin,
  handleSignup,
  handleVerify,
  handleForgotPassword,
  handleResetPassword,
  handleLogout,
  handleMe,
  handleGetProfile,
} from './controller/auth.controller';

export {
  handleAdminLoginByKey,
  handleAdminStatus,
  handleAdminStats,
  handleAdminExport,
  handleSetProStatus,
} from './controller/admin.controller';
