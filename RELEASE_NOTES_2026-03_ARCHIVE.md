# Artemis Release: Archive Milestone (2026-03)

## Summary

This release marks a staged archive milestone for Artemis.
The project is now in maintenance pause mode and will not actively accept feature expansion for now.

## Included In This Release

- Stabilized project/task management flow
- Theme system and responsive UI improvements
- AI-assisted task description flow
- Feishu bot integration groundwork (separate bot workspace)
- Daily check-in feature persisted with Supabase

## Database Notes

To enable daily check-in persistence, run:

- `docs/add_checkin_tables.sql`

This script creates:

- `checkin_templates`
- `checkin_records`
- indexes, trigger consistency check, and RLS policies

## Maintenance Policy (Archive Phase)

- No ongoing feature roadmap commitments
- Critical break/fix only when needed
- Slower response time for issues and pull requests

## Upgrade / Deploy Checklist

1. Pull latest `main`
2. Run SQL migration: `docs/add_checkin_tables.sql`
3. Ensure env vars for Supabase are configured
4. Build and deploy

## Suggested Tag

- `v0.9.0-archive-2026-03`
