# 0002 — Account identity and household authorization

Stage 2 implements the approved passkey-only model and the owner's explicit separation
of deployment and household administrators.

Identity is global; household roles live on membership rows. A deployment administrator
can configure SMTP but receives no implicit access to any household. Queries and
WebSocket handshakes check membership server-side; open sockets periodically revalidate.
Future task/file broadcasts must recheck membership immediately before sending content.

The first account requires a random CLI-issued code and creates the initial household.
Bootstrap is serialized with a transaction advisory lock, checked again at enrollment
completion and closed after the first user exists. The same lock protects one-use
token redemption and final-admin/final-passkey invariants across API/CLI processes.

WebAuthn requires discoverable credentials and user verification, validating challenge,
configured origin, RP ID and authenticator signatures through SimpleWebAuthn. Challenges
are short-lived, single-use and tied to an HttpOnly browser cookie. Credential counters
are validated under row locks. Authentication rotates the current session; session
bearers and action tokens are stored only as SHA-256 digests. HTTPS cookies use the
__Host- prefix, Secure, HttpOnly and SameSite. Mutations require the configured Origin
and JSON; untrusted forwarded hosts do not determine WebAuthn origin.

An email invitation or owner-approved 30-second hand-delivered invitation code only creates a new account or attaches membership to an
already-authenticated matching account. It cannot replace an existing account's keys. Only email-delivered invitations mark email verified; copied codes leave that status unchanged. Code expiry is checked again inside the enrollment/acceptance transaction, so starting enrollment does not extend the 30-second window.
Email recovery only targets verified addresses. The public response is generic and
delivery is queued, avoiding SMTP timing as an account-existence signal. Recovery
revokes previous sessions and outstanding recovery links; retained keys can be reviewed
and removed by the recovered user. CLI recovery also supports the initial unverified
administrator because shell access is trusted installation-owner authority.

SMTP settings and queued recovery secrets use AES-256-GCM with a separate deployment
key outside PostgreSQL. SMTP requires TLS certificate verification. The deployment key
must be included in confidential backup/restore procedures; losing it prevents decryption.
One-use email links use URL fragments; the browser clears them immediately and posts
the token as JSON. Neither ordinary request logging nor proxy access logs include
bodies, cookies, query strings or fragment tokens. Security events contain identifiers
and action names, not credential secrets.

These are implementation safeguards for the approved account model. No new task,
priority, column or household privilege model is introduced.
