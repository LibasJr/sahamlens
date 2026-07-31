import { runController } from '@/shared/http/next-response.adapter';
import { handleLogout } from '@/modules/user';

export async function POST() {
  return runController(async () => handleLogout());
}
