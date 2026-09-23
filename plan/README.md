# `plan/` — historical build specs

**Nothing in this directory describes the current build.**

These are the milestone specifications (M1–M20) written *to* an AI builder before and during
construction. They are prompts and designs, not status. Several of them specify behaviour that was
built differently, built partially, or not built at all — and a few describe things that were later
found to be broken in ways the spec did not anticipate.

**For what exists today, read in this order:**

| Document | What it is for |
|---|---|
| `../README.md` | Feature list plus the known gaps, with the gaps stated as plainly as the features |
| `../FINAL.md` | Feature-by-feature status against all 86 vision items. Counts are derived by counting table rows, not written alongside them |
| `../partial.md` | What is still incomplete, in what order, and a record of the day-groups already finished |

## Where these specs and the shipped code diverge most

Worth knowing before you read any of them as though they were true:

- **M19 (Agent Memory).** Built, then largely superseded. The five regex extractors it specifies
  still run, but four of their outputs — gate code, pets, primary equipment, equipment location —
  are now written to structured fields (`Customer.property`, the `Equipment` model) and the prose
  memory rows are deliberately *excluded* from the voice prompt to avoid stating the same fact twice
  in two wordings. The memory rows are kept for provenance, not for reading.
- **M20 (Conversation Intelligence).** Built as a template, not as intelligence. The "AI summary" is
  an `if/else` on call outcome selecting one of five canned strings; `clarityScore` is the literal
  `92`; `sentimentLabel` cannot emit `'negative'`. Real summarisation is still outstanding.
- **M14 (Communication & SMS).** Built, then extended well past this spec. Email is now a real
  channel alongside SMS, there is one `NotificationService` for both, per-business message templates
  with `{{variable}}` substitution, appointment reminders on a cron, and customer replies (`C`/`R`)
  that confirm or open a reschedule request.
- **M13 (Appointments & Scheduling).** Built, and the double-booking race this spec did not consider
  was found in QA and fixed with a per-business distributed lock. The calendar UI is still day-only
  and buckets by `getUTCHours()`, which is wrong for any non-UTC business.
- **M9–M11 (Twilio, voice, tool calling).** Built. Two things the specs did not cover: the
  media-stream WebSocket had no authentication at all (Twilio does not sign WS upgrades) and now
  uses a single-use signed token, and the LLM is Azure OpenAI or public OpenAI interchangeably
  rather than OpenAI only.
- **Everything voice.** The pipeline has never handled a real call. It compiles, the protocol work
  is correct, and `/api/health/ready` reports provider readiness — but end-to-end audio has never
  been confirmed. That is true of every voice milestone in here.

## Why these are kept

They record *why* things were built the way they were, which is occasionally the only place a
decision is explained. They are not deleted and they are not edited to match the code, because a
spec quietly rewritten after the fact stops being usable as a record of what was intended.

`plan.md` and `afterb20.md` are planning-approach notes rather than milestone specs.
