import { createECDH } from 'node:crypto';

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();

console.log('# Add these values to the production secret/environment store.');
console.log(`WEB_PUSH_VAPID_PUBLIC_KEY=${ecdh.getPublicKey().toString('base64url')}`);
console.log(`WEB_PUSH_VAPID_PRIVATE_KEY=${ecdh.getPrivateKey().toString('base64url')}`);
console.log('WEB_PUSH_VAPID_SUBJECT=mailto:support@sahamlens.id');
