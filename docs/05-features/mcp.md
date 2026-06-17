# MCP server — connect TextStack to your AI client

TextStack is a **Model Context Protocol (MCP)** server. Connect it to Claude
Desktop, Cursor, ChatGPT, or any MCP client, and the assistant can search the
TextStack library, read chapters, ask grounded questions about a book you're
reading, and manage your own highlights and vocabulary — all from the chat.

This is the canonical reference. The [package README](https://www.nuget.org/packages/TextStack.Mcp)
and the [landing page](https://textstack.app/en/mcp) point here.

## The 7 tools

The server exposes 7 tools. The public ones need no auth; the user-scoped ones
require you to be signed in (see [Authentication](#authentication)).

| Tool | What it does | Auth |
|------|--------------|------|
| `search_books` | Search the public library for books and chapters matching a query. | Public |
| `get_book` | Fetch a catalog book by slug: its `editionId` (for `ask_book`), metadata, authors, genres, and chapter list. | Public |
| `get_chapter` | Fetch a chapter's plain text (HTML stripped, length-capped) plus its number, title, and prev/next slugs. | Public |
| `list_my_highlights` | List your highlights for a given edition. | User |
| `list_my_vocabulary` | List your saved vocabulary words, optionally filtered by SRS stage or search. | User |
| `ask_book` | Ask a question about a book you're reading; spoiler-safe (answers only from chapters you've already read). | User |
| `save_highlight` | Save a passage (text + optional color/note) to your highlights for a catalog book chapter. | User |

All 7 tools are always listed regardless of whether you're signed in — only a
user-scoped *call* fails with a clean "authentication required" message when no
token is available. A typical chain is `search_books → get_book` (to get the
`editionId` / chapter ids) `→ get_chapter` / `ask_book` / `save_highlight`.

## Quick start — Claude Desktop

The most common path: run the published .NET global tool locally over stdio.

### 1. Install the tool

```bash
dotnet tool install -g TextStack.Mcp
```

This installs the `textstack-mcp` command. Runtime: .NET 10 SDK (the package
rolls forward to future majors). On .NET 10 you can also run it without
installing via `dnx textstack-mcp`.

### 2. Add it to `claude_desktop_config.json`

> **Use the absolute path to the command.** Claude Desktop is a GUI app and
> does **not** inherit your shell `PATH` on macOS, so a bare `"textstack-mcp"`
> often fails with "tool not found". Point at the installed binary directly:
> `~/.dotnet/tools/textstack-mcp` (macOS/Linux) or
> `%USERPROFILE%\.dotnet\tools\textstack-mcp.exe` (Windows).

```json
{
  "mcpServers": {
    "textstack": {
      "command": "/Users/you/.dotnet/tools/textstack-mcp",
      "env": {
        "TEXTSTACK_API_URL": "https://textstack.app/api",
        "TEXTSTACK_SITE_HOST": "textstack.app"
      }
    }
  }
}
```

Config file location:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

### 3. Restart Claude Desktop

Fully quit and reopen. The `textstack` server appears in the tools list. Try
*"search TextStack for books about distributed systems"* — that uses
`search_books` and needs no sign-in.

## Other clients

### Cursor / remote Claude — the hosted HTTP endpoint

No install needed. Point a streamable-HTTP MCP client at the hosted endpoint:

```
https://textstack.app/mcp
```

For user-scoped tools over HTTP, the bearer comes from the
`Authorization: Bearer <jwt>` header on each request — paste a device-flow JWT
(see [Authentication](#authentication)) into your client's connector config.
The remote host is multi-user: each connection authenticates with its own
bearer (there is no shared server-side token cache).

### ChatGPT custom connector

Add a custom MCP connector pointing at `https://textstack.app/mcp`. Public
tools work immediately; for user-scoped tools, supply a bearer token in the
connector's auth settings.

### Local, via the built DLL (running from source)

If you're hacking on the bridge from a checkout instead of the published tool:

```json
{
  "mcpServers": {
    "textstack": {
      "command": "dotnet",
      "args": ["/abs/path/backend/src/Ai/TextStack.Ai.Mcp/bin/Release/net10.0/TextStack.Ai.Mcp.dll"],
      "env": { "TEXTSTACK_API_URL": "https://textstack.app/api" }
    }
  }
}
```

Same stdio transport as the global tool.

## Authentication

Public tools (`search_books`, `get_book`, `get_chapter`) need no auth. The
user-scoped tools use the **OAuth 2.0 Device Authorization Grant**
([RFC 8628](https://www.rfc-editor.org/rfc/rfc8628)):

1. The first user-scoped tool call returns a clean message:
   *"authentication required — open https://textstack.app/device and enter code
   XXXX-XXXX to connect TextStack, then retry."*
2. Open [`https://textstack.app/device`](https://textstack.app/device) in a
   browser, sign in, enter the code, and approve.
3. The CLI's background poll picks up the approval and caches the token. Retry
   the tool call — it now succeeds.

The cached token is stored at `$XDG_CONFIG_HOME/textstack/mcp-token.json`,
falling back to `~/.textstack/mcp-token.json` (file mode `0600`, owner-only;
a group/world-readable cache is treated as compromised and ignored). The CLI
refreshes the access token itself and re-runs the device flow only when the
refresh token is gone.

This applies to the **local** (stdio) tool. For the **remote** (HTTP) endpoint,
there is no device flow on the server side — the bearer is supplied per request
by your client's connector config. Run the local tool once to obtain a JWT via
the device flow, then paste it into the remote client.

## Configuration

All configuration is environment-driven (set under `env` in your client config).

| Env var | Default | Purpose |
|---------|---------|---------|
| `TEXTSTACK_API_URL` | `https://textstack.app/api` | Base URL of the TextStack public API the bridge calls. |
| `TEXTSTACK_SITE_HOST` | `textstack.app` | `Host` header sent on each bridged request so the server resolves the site (needed for unauthenticated search). |
| `TEXTSTACK_MCP_TOKEN` | *(unset)* | Optional static bearer for user-scoped tools (CI / escape hatch). When set, it overrides the device flow. |
| `TEXTSTACK_MCP_TOKEN_CACHE` | *(see auth)* | Explicit file path for the device-flow token cache, overriding the default location. |
| `TEXTSTACK_MCP_TIMEOUT_SECONDS` | `15` | Upstream HTTP timeout per tool call. |
| `MCP_TRANSPORT` | `stdio` | Transport: `stdio` (local desktop client) or `http` (remote streamable HTTP host). The `--http` CLI flag also selects http. |

## Verify / smoke test

Before wiring up a client, confirm the tool speaks MCP. This sends
`initialize` → `notifications/initialized` → `tools/list` over stdio:

```bash
{ printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}'; sleep 1; printf '%s\n' '{"jsonrpc":"2.0","method":"notifications/initialized"}'; printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'; sleep 4; } | textstack-mcp
```

Expect a response with `serverInfo` naming `textstack` and a `tools/list`
result containing all 7 tools.

## Troubleshooting

- **"Tool not found" in Claude Desktop** — GUI apps don't inherit your shell
  `PATH` on macOS. Use the absolute path to the binary (`~/.dotnet/tools/textstack-mcp`
  / `%USERPROFILE%\.dotnet\tools\textstack-mcp.exe`) as `command`.
- **`dotnet` not found** (when using the build-from-source DLL config) — same
  cause; point `command` at the absolute `dotnet` path, or prefer the installed
  global tool which is a self-contained launcher.
- **"authentication required — open .../device …"** — expected on the first
  user-scoped call. Approve at the device page and retry. Public tools never
  trigger this.
- **Update the tool**: `dotnet tool update -g TextStack.Mcp`
- **Uninstall**: `dotnet tool uninstall -g TextStack.Mcp`
- **Remote endpoint returns 401** — the request carried no/invalid bearer.
  The HTTP host has no device flow; supply a valid JWT in the client's
  connector config.

## Links

- Package (nuget.org): <https://www.nuget.org/packages/TextStack.Mcp>
- Landing page: <https://textstack.app/en/mcp>
- Discovery manifest: <https://textstack.app/.well-known/mcp/manifest.json>
- Source: `backend/src/Ai/TextStack.Ai.Mcp/`
</content>
</invoke>
