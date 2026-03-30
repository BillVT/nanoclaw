/**
 * One-time OAuth2 authorization for Google Drive.
 * Run once to obtain and store a refresh token.
 *
 * Usage:
 *   npx tsx scripts/google-drive-auth.ts [path/to/google-credentials.json]
 *
 * Default credentials path: ~/Documents/nanoclaw-credentials/google-credentials.json
 * Tokens are saved to: ~/.config/nanoclaw/google-drive/
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline/promises';

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const CREDS_DIR = path.join(os.homedir(), '.config', 'nanoclaw', 'google-drive');

const sourceCredsPath =
  process.argv[2] ??
  path.join(os.homedir(), 'Documents', 'nanoclaw-credentials', 'google-credentials.json');

if (!fs.existsSync(sourceCredsPath)) {
  console.error(`Credentials file not found: ${sourceCredsPath}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(sourceCredsPath, 'utf-8'));
const { client_id, client_secret, redirect_uris } = raw.installed ?? raw.web;
const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

const authUrl = auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES });

console.log('\nOpen this URL in your browser to authorize Google Drive access:\n');
console.log(authUrl);
console.log('');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const code = await rl.question('Paste the authorization code from the browser: ');
rl.close();

const { tokens } = await auth.getToken(code.trim());

if (!tokens.refresh_token) {
  console.error('\nNo refresh token received. If you have authorized this app before,');
  console.error('revoke access at https://myaccount.google.com/permissions and try again.');
  process.exit(1);
}

fs.mkdirSync(CREDS_DIR, { recursive: true });
fs.writeFileSync(path.join(CREDS_DIR, 'token.json'), JSON.stringify(tokens, null, 2));
fs.copyFileSync(sourceCredsPath, path.join(CREDS_DIR, 'credentials.json'));

console.log(`\nCredentials saved to ${CREDS_DIR}/`);
console.log('Rebuild the container to activate Google Drive: ./container/build.sh');
