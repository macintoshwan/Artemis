# Artemis

Artemis is a project and task management app built with React, TypeScript, and Supabase.

## Project Status

Current status: V1 stable is ready for daily use.

This repository is entering a two-track phase:
- `main`: stable maintenance branch for day-to-day usage
- next branch (planned): V2 architecture exploration for AI-first workflow

## Features

- Email authentication (Supabase Auth)
- Project and task management
- Task priority, dependency, and schedule fields
- Multi-theme UI
- AI content autofill for task descriptions
- Daily check-in with Supabase persistence
- Feishu bot integration workflow (bot workspace)
- Real-time data sync via Supabase

## Tech Stack

- Frontend: React, TypeScript, Vite
- Backend: Supabase (PostgreSQL, Auth, RLS, Realtime, Edge Functions)
- Deploy: Cloudflare Pages

## Links

- Live Demo: https://artemis-b7j.pages.dev/
- GitHub: https://github.com/macintoshwan/Artemis

## Next Step Preview (V2)

Planned direction for the next iteration:

- Unify task scheduling, journal-style records, and project context under a cleaner data model
- Keep V1 workflow available while V2 is developed in an isolated branch and Supabase project
- Add AI assistant capabilities for proactive progress check-ins and schedule planning
- Introduce LLM + RAG memory pipeline for context-aware task conversations

V2 will be developed incrementally and will not break current V1 daily usage.

License: see repository LICENSE.
