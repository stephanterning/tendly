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

Workspace navigation uses validated URL query parameters and indexed browser-history
entries. A guarded history traversal first restores the current entry, then traverses
again only after the editor approves leaving. This preserves Forward entries and keeps
the URL consistent when a user cancels. URLs carry identifiers and search context, never
draft contents or authentication tokens; all data still passes the existing scoped REST
authorization. Description search highlights are ProseMirror decorations, excluded from
saved content and Undo history. Comment landing waits for the attachment gallery before
scrolling, so loading images does not push the target out of view.

Activity records currently contain changed field names, not before/after values. The UI
uses readable creation/change descriptions without inventing historical values. Adding
value-level audit history requires a separate persistence decision.

## Image workflow refinement — 2026-11-01

Each selected file has an independent upload attempt, progress, result and retry. A
failed file does not stop later files. The client sends an optional UUID `X-Upload-Id`
and reuses it for retries, including uncertain network outcomes. The server serializes
that ID with a non-blocking PostgreSQL advisory lock and returns an already committed
attachment only after checking household/task scope. A busy attempt returns 503. An ID
bound to another task/household or a deleted attachment returns 409. No migration or
new storage location is required; the UUID is the attachment's existing primary key.

Editor upload positions are mapped through ProseMirror transactions, including typing,
deletions and earlier uploads in a batch. Temporary placeholders are decorations, never
saved document nodes. Completion inserts without focusing the editor, moving its current
selection or replacing selected text. A removed position or external document replacement
requires an explicit new insertion position; the uploaded original remains in the gallery.
Image dimensions are loaded from the authenticated preview before insertion to reserve
layout space on later renders. Inline removal/Undo leaves the attachment intact. Gallery
insertion reuses the existing attachment without another upload.

Queues retain failed files in memory for retry; they are not an offline upload service.
Closing the task, posting the affected comment or changing its editor is guarded until
unfinished entries are retried or explicitly dismissed. Task text can autosave while files
are uploading. Completed attempts collapse into a clearable summary. The browser warns
before reloading with unfinished work; it cannot retain local file bytes after a reload.
