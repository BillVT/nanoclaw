---
name: google-drive
description: Read, create, and organize files in Google Drive. Use for cloud file storage, document creation, listing, and search.
allowed-tools: mcp__googledrive__list_files, mcp__googledrive__get_file, mcp__googledrive__read_file, mcp__googledrive__create_file, mcp__googledrive__update_file, mcp__googledrive__create_folder, mcp__googledrive__move_file, mcp__googledrive__delete_file, mcp__googledrive__search_files
---

# Google Drive

Access Google Drive to list, read, create, update, and organize files.

## Available Tools

| Tool | Description |
|------|-------------|
| `mcp__googledrive__list_files` | List files in a folder (default: root). Returns id, name, mimeType, size, modifiedTime. |
| `mcp__googledrive__get_file` | Get full metadata for a file by ID. |
| `mcp__googledrive__read_file` | Read file content. Google Docs → plain text; Sheets → CSV; other text → raw. |
| `mcp__googledrive__create_file` | Create a new text file in Drive. |
| `mcp__googledrive__update_file` | Update an existing file's content and optionally rename it. |
| `mcp__googledrive__create_folder` | Create a new folder. |
| `mcp__googledrive__move_file` | Move a file to a different folder. |
| `mcp__googledrive__delete_file` | Move a file to trash. |
| `mcp__googledrive__search_files` | Search files by name or content using Drive query syntax. |

## Examples

List files in root:
```
mcp__googledrive__list_files {}
```

List files in a specific folder:
```
mcp__googledrive__list_files { "folder_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" }
```

Search for files:
```
mcp__googledrive__search_files { "query": "name contains 'meeting'" }
mcp__googledrive__search_files { "query": "fullText contains 'quarterly report'" }
mcp__googledrive__search_files { "query": "mimeType = 'application/vnd.google-apps.document'" }
```

Read a file:
```
mcp__googledrive__read_file { "file_id": "1BxiMVs0XRA..." }
```

Create a file:
```
mcp__googledrive__create_file { "name": "notes.txt", "content": "Hello world" }
```

Update a file:
```
mcp__googledrive__update_file { "file_id": "1BxiMVs0XRA...", "content": "Updated content" }
```

## Notes

- File IDs come from `list_files`, `search_files`, or `create_file` results.
- `read_file` truncates files larger than 50,000 characters.
- `delete_file` moves to trash, not permanent deletion.
- Drive query syntax: https://developers.google.com/drive/api/guides/search-files
