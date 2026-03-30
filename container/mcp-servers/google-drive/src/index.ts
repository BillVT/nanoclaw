/**
 * Google Drive MCP server for NanoClaw agents.
 * Exposes Drive operations as MCP tools.
 * Credentials are read from /home/node/.config/google-drive/ (mounted by the host).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { google, drive_v3 } from 'googleapis';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CREDS_DIR =
  process.env.GOOGLE_DRIVE_CREDS_DIR ||
  path.join(os.homedir(), '.config', 'google-drive');
const CREDENTIALS_PATH = path.join(CREDS_DIR, 'credentials.json');
const TOKEN_PATH = path.join(CREDS_DIR, 'token.json');

function getAuth(): InstanceType<typeof google.auth.OAuth2> {
  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
  const { client_id, client_secret, redirect_uris } = raw.installed ?? raw.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
  auth.setCredentials(token);

  // Persist refreshed tokens if the mount is writable
  auth.on('tokens', (tokens) => {
    try {
      const current = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...current, ...tokens }, null, 2));
    } catch {
      // read-only mount or other error — safe to ignore, refresh_token is still valid
    }
  });

  return auth;
}

const server = new Server(
  { name: 'googledrive', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_files',
      description:
        'List files in Google Drive. Returns id, name, mimeType, size, modifiedTime.',
      inputSchema: {
        type: 'object',
        properties: {
          folder_id: {
            type: 'string',
            description: "Folder ID to list. Omit for Drive root.",
          },
          query: {
            type: 'string',
            description:
              "Additional Drive query clause, e.g. \"name contains 'report'\".",
          },
          page_token: {
            type: 'string',
            description: 'Token for the next page of results.',
          },
        },
      },
    },
    {
      name: 'get_file',
      description: 'Get metadata for a file by ID.',
      inputSchema: {
        type: 'object',
        properties: {
          file_id: { type: 'string', description: 'The Drive file ID.' },
        },
        required: ['file_id'],
      },
    },
    {
      name: 'read_file',
      description:
        'Read the content of a file. Google Docs → plain text, Sheets → CSV, other text files → raw content.',
      inputSchema: {
        type: 'object',
        properties: {
          file_id: { type: 'string', description: 'The Drive file ID.' },
        },
        required: ['file_id'],
      },
    },
    {
      name: 'create_file',
      description: 'Create a new file in Google Drive with text content.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'File name including extension.' },
          content: { type: 'string', description: 'Text content for the file.' },
          mime_type: {
            type: 'string',
            description: "MIME type. Defaults to 'text/plain'.",
          },
          folder_id: {
            type: 'string',
            description: 'Parent folder ID. Omit to place in Drive root.',
          },
        },
        required: ['name', 'content'],
      },
    },
    {
      name: 'update_file',
      description: "Update an existing file's content and optionally rename it.",
      inputSchema: {
        type: 'object',
        properties: {
          file_id: { type: 'string', description: 'The Drive file ID to update.' },
          content: { type: 'string', description: 'New text content.' },
          name: { type: 'string', description: 'New file name (optional).' },
        },
        required: ['file_id', 'content'],
      },
    },
    {
      name: 'create_folder',
      description: 'Create a new folder in Google Drive.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Folder name.' },
          parent_id: {
            type: 'string',
            description: 'Parent folder ID. Omit for Drive root.',
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'move_file',
      description: 'Move a file to a different folder.',
      inputSchema: {
        type: 'object',
        properties: {
          file_id: { type: 'string', description: 'The Drive file ID to move.' },
          folder_id: { type: 'string', description: 'Destination folder ID.' },
        },
        required: ['file_id', 'folder_id'],
      },
    },
    {
      name: 'delete_file',
      description: 'Move a file to trash.',
      inputSchema: {
        type: 'object',
        properties: {
          file_id: { type: 'string', description: 'The Drive file ID to trash.' },
        },
        required: ['file_id'],
      },
    },
    {
      name: 'search_files',
      description:
        "Search Google Drive using a query string. Supports Drive query syntax: name contains 'x', fullText contains 'x', mimeType = 'y'.",
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: "Drive search query, e.g. \"name contains 'budget'\".",
          },
        },
        required: ['query'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });
  const { name, arguments: args = {} } = request.params;
  const a = args as Record<string, string>;

  try {
    switch (name) {
      case 'list_files': {
        let q = a.folder_id ? `'${a.folder_id}' in parents` : `'root' in parents`;
        if (a.query) q += ` and ${a.query}`;
        q += ' and trashed = false';

        const res = await drive.files.list({
          q,
          fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime)',
          pageToken: a.page_token,
          pageSize: 50,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(res.data, null, 2) }] };
      }

      case 'get_file': {
        const res = await drive.files.get({
          fileId: a.file_id,
          fields: 'id, name, mimeType, size, modifiedTime, parents, webViewLink',
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(res.data, null, 2) }] };
      }

      case 'read_file': {
        const meta = await drive.files.get({ fileId: a.file_id, fields: 'mimeType, name' });
        const mimeType = meta.data.mimeType ?? '';
        let text: string;

        if (mimeType === 'application/vnd.google-apps.document') {
          const res = await drive.files.export(
            { fileId: a.file_id, mimeType: 'text/plain' },
            { responseType: 'text' },
          );
          text = res.data as string;
        } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
          const res = await drive.files.export(
            { fileId: a.file_id, mimeType: 'text/csv' },
            { responseType: 'text' },
          );
          text = res.data as string;
        } else if (mimeType.startsWith('application/vnd.google-apps.')) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Cannot read ${mimeType} as text. Use Google Workspace export formats.`,
              },
            ],
          };
        } else {
          const res = await drive.files.get(
            { fileId: a.file_id, alt: 'media' },
            { responseType: 'text' },
          );
          text = res.data as string;
        }

        const MAX = 50_000;
        if (text.length > MAX) {
          text = text.slice(0, MAX) + `\n\n[Truncated — ${text.length} total chars]`;
        }
        return { content: [{ type: 'text' as const, text }] };
      }

      case 'create_file': {
        const res = await drive.files.create({
          requestBody: {
            name: a.name,
            mimeType: a.mime_type ?? 'text/plain',
            parents: a.folder_id ? [a.folder_id] : undefined,
          },
          media: {
            mimeType: a.mime_type ?? 'text/plain',
            body: a.content,
          },
          fields: 'id, name, mimeType, webViewLink',
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(res.data, null, 2) }] };
      }

      case 'update_file': {
        const params: drive_v3.Params$Resource$Files$Update = {
          fileId: a.file_id,
          media: { body: a.content },
          fields: 'id, name, mimeType, modifiedTime',
        };
        if (a.name) params.requestBody = { name: a.name };
        const res = await drive.files.update(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(res.data, null, 2) }] };
      }

      case 'create_folder': {
        const res = await drive.files.create({
          requestBody: {
            name: a.name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: a.parent_id ? [a.parent_id] : undefined,
          },
          fields: 'id, name',
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(res.data, null, 2) }] };
      }

      case 'move_file': {
        const meta = await drive.files.get({ fileId: a.file_id, fields: 'parents' });
        const removeParents = (meta.data.parents ?? []).join(',');
        const res = await drive.files.update({
          fileId: a.file_id,
          removeParents,
          addParents: a.folder_id,
          fields: 'id, name, parents',
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(res.data, null, 2) }] };
      }

      case 'delete_file': {
        await drive.files.update({ fileId: a.file_id, requestBody: { trashed: true } });
        return { content: [{ type: 'text' as const, text: `File ${a.file_id} moved to trash.` }] };
      }

      case 'search_files': {
        const res = await drive.files.list({
          q: `${a.query} and trashed = false`,
          fields: 'files(id, name, mimeType, size, modifiedTime)',
          pageSize: 30,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(res.data, null, 2) }] };
      }

      default:
        return {
          content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err: unknown) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
