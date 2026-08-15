---
type: operations guide
title: OpenWiki update workflow
description: Scheduled and manual GitHub Actions workflow that regenerates the repository code wiki.
tags: [operations, github-actions, documentation]
---

# OpenWiki update workflow

`.github/workflows/openwiki-update.yml` runs manually or daily at `0 8 * * *` on Ubuntu. It grants `contents: write` and `pull-requests: write`, checks out full history (`fetch-depth: 0`) so OpenWiki can compare against the commit it last documented, installs Node 22 with pinned `openwiki@0.3.3`, `mermaid@11.16.0`, and `jsdom@29.1.1`, then runs `openwiki code --update --print`.

The run uses provider `openai-chatgpt`, model `gpt-5.6-luna`, and repository secrets `OPENWIKI_LANGSMITH_API_KEY` plus optional LangSmith tracing. The pull-request action is pinned and only adds `openwiki`, `AGENTS.md`, `CLAUDE.md`, and the workflow file, on branch `openwiki/update`, with a fixed documentation-update title/body. Credentials belong only in GitHub Secrets; do not copy them into wiki pages or source snapshots.

There is no repository unit test for the workflow. Safely changing it means preserving the source-selection boundary (`openwiki code --update` runs at repository root), full-history checkout, pinned action/tool versions unless intentionally upgraded, secret indirection, and the PR `add-paths` allowlist. Validate YAML/action syntax in GitHub or an action-lint tool, run the equivalent OpenWiki command in a disposable checkout with credentials supplied externally, and inspect the generated diff to ensure only the allowlisted paths changed.
