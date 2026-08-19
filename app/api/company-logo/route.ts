import { runController } from '@/shared/http/next-response.adapter';
import { handleCompanyLogo } from '@/modules/company/controller/company-logo.controller';

export async function GET(request: Request) {
  return runController(() => handleCompanyLogo(request), request);
}
