import { permanentRedirect } from 'next/navigation';

export default function LegacyHomePage() {
  permanentRedirect('/');
}
