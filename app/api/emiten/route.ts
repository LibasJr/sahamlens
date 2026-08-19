import { runController } from '@/shared/http/next-response.adapter';
import { loadEmitenList } from '@/shared/market/emiten-list';

export const revalidate = 3600; // company list barely changes

export async function GET() {
  return runController(async () => {
    const emiten = loadEmitenList();
    return { status: 200, body: { count: emiten.length, emiten } };
  });
}
