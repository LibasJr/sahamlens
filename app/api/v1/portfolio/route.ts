// Compatibility alias. The canonical implementation lives at /api/portfolio.
// Re-exporting prevents contract/security fixes from drifting between duplicate files.
export { GET } from '../../portfolio/route';
