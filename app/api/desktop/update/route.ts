import { NextRequest } from 'next/server';

function isNewer(candidate: string, current: string) {
  const parse = (version: string) => version.split('.').map((part) => Number(part) || 0);
  const [a, b, c] = parse(candidate); const [x, y, z] = parse(current);
  return a > x || (a === x && (b > y || (b === y && c > z)));
}

/** Public release metadata. Set the three DESKTOP_RELEASE_* variables when publishing a signed installer. */
export async function GET(request: NextRequest) {
  const current = request.nextUrl.searchParams.get('current') ?? '0.0.0';
  const version = process.env.DESKTOP_RELEASE_VERSION?.trim();
  const downloadUrl = process.env.DESKTOP_RELEASE_URL?.trim();
  const notes = process.env.DESKTOP_RELEASE_NOTES?.trim();
  const available = Boolean(version && downloadUrl && isNewer(version, current));
  return Response.json({ version: version ?? current, downloadUrl: available ? downloadUrl : undefined, notes: available ? notes : undefined, available });
}
