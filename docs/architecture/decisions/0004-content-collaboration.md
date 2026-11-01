# 0004 — Rich content, file storage and household synchronization

Date: 2026-11-01. Implements Stage 7 on the existing task model.

## Content and conflicts

Descriptions accept legacy strings or validated Tiptap documents. PostgreSQL stores
JSONB; the migration uses `to_jsonb(description)` so literal text, newlines and HTML-like
characters survive without HTML interpretation. New edits normalize into documents.
The server validates node/mark structure, size/depth, safe links, household mentions
and embedded attachment ownership. Rich descriptions are one logical field under the
existing task version guard; this is not character-level collaborative editing.

Comments use their own version guard and author-only mutations. Deleted comments are
retained for guarded Undo. Activity displays the recorded actor/time/changed fields,
not fabricated before/after values. Comment drafts are tab-local sessionStorage,
keyed by user, household and task. Task drafts stay in the existing autosave editor.
External document replacements reset the editor's native Undo history; accepting a
remote version must not leave a stale local inverse that silently restores old text.

## Files

The API streams each file to a generated UUID key in the attachment volume and only
commits metadata after validation/preview generation. Client filenames are display
metadata, never storage paths. The default limit is 50,000,000 bytes; the API advertises
configuration to clients. Raising it also requires matching proxy limits.

Original bytes are preserved. Images get full-size JPEG display copies and thumbnails;
HEIC is decoded without requiring manual conversion. Conversion runs in a separate
process with a timeout and limited JS heap. A per-process concurrency cap bounds the
number of active uploads/conversions. PDFs use native browser previews with an original
download fallback. Downloads and previews always recheck session/household access.

A failed request removes staged files. Hourly cleanup removes unregistered files older
than 24 hours, avoiding in-flight uploads; registered files survive. Lifecycle ownership
and retention across archive/Trash/recurrence are integrated in Stage 6. Manual backup
stops writers and captures the database, file volume and configuration together.

## Synchronization and search

The single API process in Compose sends household-scoped WebSocket invalidations after
successful REST mutations. Messages name affected resources, not private row content;
clients refetch authoritative REST data. Session/membership are rechecked before delivery
and periodically while idle. Open/reconnect and returning to the foreground reconcile
state. This is deliberately not an event log or a multi-replica broker. Future worker
mutations must publish invalidations or add shared delivery in their owning stage.

Search uses parameterized SQL over tasks, rich-description text, comments, epics and
tags. Household and Trash predicates apply before pagination. No duplicate filter engine
is introduced: Stage 5 integrates the authoritative filter evaluator, Stage 4 descendants
and inherited values, and Stage 6 archive/lifecycle workflows.
