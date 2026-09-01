# LinkedIn Profile API — Submission Report

---

## Contents

| # | Section | |
|---|---|---|
| 1 | [What this project is](#1-what-this-project-is) | Scope, constraint, stack |
| 2 | [Setup and running it](#2-setup-and-running-it) | **Start here** — env, install, verify |
| 3 | [How I approached the problem](#3-how-i-approached-the-problem) | Reverse-engineering findings |
| 4 | [How it works](#4-how-it-works) | Request flow and architecture |
| 5 | [Account safety: precautions and why](#5-account-safety-precautions-and-why) | Rate limits, caching, credentials |
| 6 | [API documentation](#6-api-documentation) | Endpoints, contracts, examples |
| 7 | [Testing](#7-testing) | Offline fixture suites |
| 8 | [Known limitations](#8-known-limitations) | What does not work yet |
| 9 | [Summary](#10-summary) | The short version |

**Jump to the detail:**
[2.2 Environment variables](#22-environment-variables) ·
[2.4 Verify the server](#24-verify-the-server) ·
[3.3 The hardest part](#33-the-hardest-part-no-semantic-field-names) ·
[5.1 Two limiters](#51-two-limiters-and-why-one-is-not-enough) ·
[6.2 `GET /api/profile`](#62-get-apiprofile) ·
[6.3 Section sub-resource](#63-get-apiprofilevanitynamesectionssection) ·
[6.5 Entity schemas](#65-entity-schemas) ·
[6.6 Errors](#66-errors)

---

## 1. What this project is

A hosted HTTP API that accepts a LinkedIn profile URL and returns structured
JSON: name, headline, location, about, experience, education, skills,
certifications, volunteering, projects and profile imagery.

```
GET /api/profile?url=https://www.linkedin.com/in/shaswata-gogoi
```

It is built to the assignment's stated constraint: **a purely
reverse-engineered solution that hits LinkedIn endpoints directly and does not
use a browser.** There is no Playwright, no Puppeteer, no headless rendering
anywhere in the runtime. Every byte of data is obtained with `fetch()` and
parsed in-process. Browsers were used only during development, to capture
network traffic for analysis.

**Stack:** TypeScript, Express 5, zero runtime dependencies beyond `express`
and `swagger-ui-express`.

---

## 2. Setup and running it

### 2.1 Prerequisites

- **Node.js 20+** (uses the native `--env-file` flag and global `fetch`)
- **A LinkedIn account dedicated to this project.** Do not use a personal or
  primary account — see [Account safety](#5-account-safety-precautions-and-why)
  for why this matters.

### 2.2 Environment variables

Copy `.env.example` to `.env` and fill in the two session values. `.env` is
gitignored and must never be committed.

```bash
cp .env.example .env
```

```ini
# Required — both must come from the SAME logged-in session
LINKEDIN_SESSION_COOKIE=li_at=AQEDA...; JSESSIONID="ajax:1234567890123456789"
LINKEDIN_CSRF_TOKEN=ajax:1234567890123456789

# Optional — these are the defaults
PORT=3000
CACHE_TTL_HOURS=48            # how long fetched cards stay cached
RATE_LIMIT_PER_MINUTE=5       # inbound, per IP
UPSTREAM_MIN_INTERVAL_MS=1200 # minimum gap between calls to LinkedIn
```

**Where the two session values come from.** Log into LinkedIn in a browser,
then open **DevTools → Application → Cookies → `https://www.linkedin.com`**:

| Variable | Value |
|---|---|
| `LINKEDIN_SESSION_COOKIE` | `li_at=<value>; JSESSIONID="<value>"` — just those two cookies, semicolon-separated. **Keep the double quotes around the JSESSIONID value** |
| `LINKEDIN_CSRF_TOKEN` | The same JSESSIONID value **without** the quotes, e.g. `ajax:1234567890123456789` |

Two things worth knowing:

- **Do not paste the whole Cookie header from the Network tab.** It carries a
  dozen tracking and consent cookies that are irrelevant here, and fewer
  credential values on disk is strictly better. `li_at` is the session;
  `JSESSIONID` is what the CSRF token has to match.
- **The pair must come from the same session.** A mismatch is rejected by
  LinkedIn with an opaque `403`. The app validates this **at startup** and names
  the specific problem — missing `li_at`, quoted token, or a token that does not
  match the cookie — rather than letting it surface later as a confusing
  upstream failure.

Sessions expire after a few weeks. A sudden run of `502`s usually means the
cookie needs refreshing.

In production these would be injected by the hosting platform's secret manager
rather than a file.

### 2.3 Install and run

```bash
npm install

npm run dev     # development server, reads .env

# production
npm run build && npm start
```

### 2.4 Verify the server

With the server running on port 3000:

```bash
# 1. Liveness — no credentials involved
curl -s localhost:3000/health
# {"status":"ok","uptimeSeconds":3}

# 2. A real profile fetch (~6 s cold — that is the outbound throttle, not slow code)
curl -s 'localhost:3000/api/profile?url=https://www.linkedin.com/in/shaswata-gogoi' \
  | head -c 400

# 3. Run it again — served from cache, returns instantly
curl -s 'localhost:3000/api/profile?url=https://www.linkedin.com/in/shaswata-gogoi' \
  | grep -o '"cached":[a-z]*'
# "cached":true

# 4. One section in full
curl -s 'localhost:3000/api/profile/shaswata-gogoi/sections/education'

# 5. Expand a section beyond the profile-card preview
curl -s 'localhost:3000/api/profile?url=https://www.linkedin.com/in/shaswata-gogoi&expand=skills' \
  | grep -o '"totalCount":[0-9]*'

# 6. Error handling — a bare word is rejected on purpose
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:3000/api/profile?url=nonsense'
# 400
```

**Or use the browser.** Open **<http://localhost:3000/docs>** for the Swagger
reference, where every endpoint can be executed live with "Try it out". Any
unrecognised path — including `/` — redirects there.

> Each *uncached* call costs 5 upstream LinkedIn requests against a
> rate-limited account. Repeats of the same profile are free. Please avoid
> hammering "Try it out" on new profiles.

### 2.5 If something goes wrong

| Symptom | Likely cause |
|---|---|
| Startup error naming `LINKEDIN_*` | Env vars missing, quoted CSRF token, or a cookie/token mismatch — the message says which |
| `502` on every profile | Session cookie has expired; re-copy both values |
| `429` | The inbound limit (5/min per IP by default). Raise `RATE_LIMIT_PER_MINUTE` for local testing |
| A section is empty or short | Check `extractionWarnings` in the response — it names the section and the reason |

---

## 3. How I approached the problem

### 3.1 The starting constraint

LinkedIn has no public API for third-party profile data. Their official
Partner API returns data only for the *authenticated* member under an approved
OAuth app, which cannot satisfy "given an arbitrary profile URL, return that
person's data". Meeting the requirement therefore meant understanding the
interfaces LinkedIn's own web client uses.

### 3.2 What the investigation actually found

I captured and analysed live network traffic across **13 different profiles**.
Three findings shaped the whole design:

**Profile content is not one API call.** The page is Server-Driven UI. Each
section arrives from a separate POST to
`/flagship-web/rsc-action/actions/component`, keyed by a `componentId`.

**The response is not JSON.** It is React's **Flight wire protocol** —
newline-delimited chunks of the form `{id}:{tag}{payload}` with `$L{id}`
cross-references between them. This is a documented, public React format, not
a proprietary one, which is what makes parsing it a reasonable engineering bet
rather than a guess. I wrote a small decoder for it (chunk parser + reference
resolver).

**Voyager is a dead end for this use case.** The older, widely-documented
`/voyager/api/...` surface still exists, and most published scraping tutorials
target it. In current traffic it carries only auxiliary data — navigation,
messaging, settings, notifications. The one profile-shaped call
(`voyagerIdentityDashProfiles`) carries the *viewer's* URN, identical across
two different profile captures; it returns your own profile, not the one being
viewed. I verified this before discarding the approach.

### 3.3 The hardest part: no semantic field names

This is the finding that dictated the parser design, and it is worth stating
plainly because it is not obvious from the outside.

**The payload contains no field names.** Titles, companies and dates are bare
strings under a generic `children` key, in document order. There is no
`"title":` or `"company":` to key off. CSS classes are build-hashed
(`_02484ad3 _61558a10 f28af954`) and change every deploy, so they are useless
as selectors.

Extraction is therefore positional — and *that* is exactly where it gets
fragile, because optional fields shift every position after them.

I learned this the hard way. My first Experience parser assumed a fixed layout
and worked perfectly on the profile I built it against. It then broke on the
next profile, because that member had a company-level location line the first
did not. The fix broke on a third profile whose employment type was bundled
differently. Each patch handled the case in front of me and nothing more.

**The resolution was to stop inferring structure from position.** The parsers
now work down a strict hierarchy:

| Priority | Strategy | Why |
|---|---|---|
| 1 | **Structural** — LinkedIn's own `componentkey` entry boundaries | Cannot be fooled by data that happens to look like a boundary |
| 2 | **Content classification** — identify each value by *what it is*, against closed vocabularies and anchored patterns | Works where no structural marker exists |
| 3 | Positional assumptions | **Never** — they break silently and produce confident, plausible, wrong output |

Concretely, a date is recognised by an *anchored* regex (so a date mentioned
inside a description sentence is not mistaken for a field), an employment type
by membership of LinkedIn's closed picklist, a location by a work-arrangement
suffix or comma-separated place, and a role's boundary by walking *backwards*
from its date rather than forwards from its title — because a description is
an unbounded run of bullets going forwards, but bounded going backwards.

### 3.4 Where structure exists, I used it

Skills proved the value of the hierarchy. A skill's supporting lines are free
text with no distinguishing form — they may be a role (`"SDE at Attack
Capital"`), a project name (`"Sanctions Portal"`), or a course title. No
content rule can separate those from a skill name. But each skill has its own
`com.linkedin.sdui.profile.skill(...)` component node, so the structural
boundary resolves it exactly. Content classification alone would have reported
"Sanctions Portal" as a skill.

---

## 4. How it works

### 4.1 Request flow

```
GET /api/profile?url=…
        │
        ├─ validate URL → vanityName
        │
        ├─ 1 GET   /in/{vanity}/                    → topcard (server-rendered HTML)
        ├─ 4 POSTs /rsc-action/actions/component    → section cards (Flight)
        │     • profileCardsAboveActivity           → about
        │     • profileCardsExperienceOnly          → experience
        │     • profileCardsBelowActivityPart1…     → education, certs, volunteer, projects
        │     • profileCardsBelowActivityPart7      → skills
        │
        ├─ decode Flight → parse each section (isolated try/catch)
        └─ assemble → JSON
```

**Five upstream calls, not eight.** One card serves four sections, so the
orchestrator groups sections by card and fetches each exactly once. There is a
test asserting this count — if it rises, something started fetching per-section.

### 4.2 The topcard is a separate source

Name, headline, location, pronouns and images appear in **none** of the
component cards. They come with the profile page document, which is plain
server-rendered HTML. I confirmed this against a raw HTTP response body rather
than a browser DOM save, so it is genuinely retrievable without rendering.

It has no `<h1>`, no Open Graph tags and no JSON-LD, so extraction anchors on
`<title>`, the `<link rel="preload">` image entries, and the "Contact info"
label.

### 4.3 Adding a section is one registry entry

`SECTION_REGISTRY` is the only place a section is named. The orchestrator loops
it and never mentions a section explicitly, so adding Honors or Languages means
writing a parser and adding one entry — no orchestrator change.

### 4.4 Partial failure is a first-class case

Every section parse is individually wrapped. A section that fails degrades to
an empty envelope plus an `extractionWarnings` entry; it never fails the
request. Only a *total* upstream failure — no document and no cards — is a 502.

---

## 5. Account safety: precautions and why

This was treated as a design constraint, not an afterthought. LinkedIn
suspends accounts for automated access, and the risk is real: **Proxycurl, a
well-known LinkedIn data API, was shut down in 2025** after legal action by
Microsoft, with a court order to delete all LinkedIn-derived data.

### 5.1 Two limiters, and why one is not enough

This is the most important precaution in the project, and the reasoning matters
more than the code.

**Inbound — per-IP request cap** (`RATE_LIMIT_PER_MINUTE`, default 5/min).
Returns `429` with a `Retry-After` header. This protects *the service*.

**Outbound — a global throttle on calls to LinkedIn**
(`UPSTREAM_MIN_INTERVAL_MS`, default 1200 ms). A single global queue serialises
every upstream call regardless of how many API requests are in flight. **This
is what protects the account.**

**Why inbound limiting alone would not work:** one API request fans out to five
upstream calls. Five concurrent callers inside the inbound limit would fire
twenty-five requests at LinkedIn in a burst from a single account — exactly the
pattern that triggers automated defences. The inbound limiter bounds *callers*;
only the outbound throttle bounds *LinkedIn traffic*. They are not substitutes,
and conflating them is an easy and expensive mistake.

### 5.2 Caching at the fetch layer, not the response layer

The cache sits in front of every upstream fetch, keyed per profile **and per
card** (and per detail page, and per page offset). A preview request and a
later `?expand=` request for the same profile therefore **share** their card
fetches — something a response-level cache cannot do, because the two responses
differ.

Default TTL is 48 hours. A repeat request costs **zero** upstream calls and
returns `"cached": true`.

### 5.3 Paging matched to LinkedIn's own client

Detail lists are requested `10` entries at a time, at offsets `0, 10, 20…` —
exactly what the browser does. Asking for a larger page is tempting, but if the
server silently caps it, a short page reads as "the list ended" and the result
is quietly truncated. Matching the real client is both safer and more accurate.

Paging stops as soon as a page returns fewer than a full page, or contributes
no new entries, and is hard-capped at 40 pages so a misbehaving pager cannot
spend unbounded quota.

### 5.4 Request shaping

Requests carry the same headers LinkedIn's own client sends
(`x-li-rsc-stream`, the per-screen `x-li-anchor-page-key`, a page-instance
tracking id, a realistic user agent and referer). The intent is to be a
well-behaved client rather than an obviously synthetic one.

### 5.5 Credential handling

- Only two cookies are needed — `li_at` and `JSESSIONID` — not the full Cookie
  header. Fewer credential values on disk is strictly better.
- Both come from environment variables; `.env` is gitignored, and the captured
  request-body template is gitignored too.
- The pair is **validated at startup** with specific error messages, because a
  mismatched pair produces an opaque `403` that is otherwise hard to diagnose.
- The backing account is a dedicated, non-primary account.

### 5.6 Development did not spend quota

Every test runs against **captured HAR fixtures**, not the network. The full
suite — parsers, orchestrator, HTTP layer, caching, rate limiting — runs with
no credentials and no LinkedIn traffic at all. Hundreds of test runs during
development cost zero upstream requests.

---

## 6. API documentation

Base URL in the examples: `http://localhost:3000`.
Interactive reference with live "Try it out": **`GET /docs`**. Raw OpenAPI
document: `GET /docs/openapi.json`.

### 6.1 The response contract, and why it is shaped this way

**LinkedIn's profile card returns only about two entries per section.** The
rest sit behind "Show all". So every list section is returned in a fixed
envelope:

```json
{ "items": [ … ], "totalCount": 8, "truncated": true }
```

| Field | Meaning |
|---|---|
| `items` | The entries retrieved |
| `totalCount` | How many entries LinkedIn actually holds. Absent means *unknown*, not *none* |
| `truncated` | `true` when you are looking at a preview |

Returning only `items` would be lying by omission — a caller would have no way
to know it received 2 of 8 certifications.

**The envelope shape never varies.** `?expand=` changes only `items.length` and
`truncated`, never the structure — one response type to consume either way.

---

### 6.2 `GET /api/profile`

Returns the whole profile.

**Query parameters**

| Param | Type | Required | Description |
|---|---|---|---|
| `url` | string | **yes** | Full profile URL, e.g. `https://www.linkedin.com/in/shaswata-gogoi`. Scheme-less (`linkedin.com/in/x`) and regional hosts (`in.linkedin.com`) are accepted. **A bare word like `shaswata-gogoi` is rejected here on purpose** — targeting is by vanity name alone, so a typo would silently return a *different member's* profile rather than a 404 |
| `expand` | string | no | Comma-separated sections to return in full, or `all`. Currently served in full: `experience`, `education`, `skills`. Accepted but not yet available: `certifications`, `volunteer`, `projects` — these return the preview plus a warning |
| `forceRefresh` | boolean | no | Bypass the cache and re-fetch. Default `false` |

**Why `expand` is a list and not a boolean:** each expanded section costs
additional upstream requests against a rate-limited account. A caller who wants
full education should not pay for full experience.

#### Example request

```http
GET /api/profile?url=https://www.linkedin.com/in/shaswata-gogoi&expand=experience,education,skills
Host: localhost:3000
```

#### Example response — `200 OK`

Abridged for length: `experience.items` and `skills.items` each show the first
few of the entries actually returned.

```json
{
  "profileUrl": "https://www.linkedin.com/in/shaswata-gogoi",
  "vanityName": "shaswata-gogoi",
  "name": "Shaswata Gogoi",
  "headline": "Engineering @Attack Capital (YC W22)",
  "location": "Guwahati, Assam, India",
  "pronouns": "He/Him",
  "profileImageUrl": "https://media.licdn.com/dms/image/v2/D4D03AQEBAAL1EjCIYA/profile-displayphoto-crop_800_800/…",
  "about": "Over the past 1.5+ years, I've been building production-grade applications at fast-paced startups. Currently, I'm working as a software developer at Attack Capital (YC-backed), building core features and systems for their venture, PowerDialer.AI\n\nThroughout my journey, I've operated beyond just writing code…",

  "experience": {
    "items": [
      {
        "companyName": "Attack Capital",
        "totalDuration": "8 mos",
        "location": "New York, United States",
        "locationType": "Remote",
        "positions": [
          {
            "title": "SDE",
            "employmentType": "Full-time",
            "startDate": "Jun 2026",
            "endDate": "Present",
            "duration": "3 mos",
            "description": "• Reduced post-call note-taking time for sales reps by 85% by building a real-time AI call-summary autofill system using Twilio Live Transcription, Google Gemini, and WebSockets…"
          },
          {
            "title": "Full Stack Developer",
            "employmentType": "Internship",
            "startDate": "Jan 2026",
            "endDate": "May 2026",
            "duration": "5 mos",
            "description": "• Engineered PowerDialer CRM integrations (GoHighLevel, Odoo, Bitrix24, Outreach, Zoho) across Chrome extension (React), Next.js, and Node.js…"
          }
        ],
        "skills": ["PostgreSQL", "Chrome Extensions", "Next.js"],
        "unnamedSkillCount": 9
      },
      {
        "companyName": "Smartifai",
        "employmentType": "Internship",
        "positions": [
          {
            "title": "Full-stack Developer",
            "startDate": "Jun 2025",
            "endDate": "Dec 2025",
            "duration": "7 mos",
            "location": "Bengaluru, Karnataka, India",
            "locationType": "Remote",
            "description": "• Scaled 5+ Node.js microservices integrating multi-platform streaming (YouTube, Kick) with OAuth (PKCE), MySQL, AWS SQS and Redis caching, improving request throughput by 35%…"
          }
        ],
        "skills": ["React.js", "MySQL"],
        "unnamedSkillCount": 7
      }
    ],
    "truncated": false
  },

  "education": {
    "items": [
      {
        "institution": "Jorhat Engineering College",
        "degree": "Bachelor of Technology - BTech, Computer Science and Engineering",
        "startDate": "Oct 2022",
        "endDate": "Jul 2026"
      },
      { "institution": "Shrimanta Shankar Academy, Guwahati", "degree": "Senior Secondary" },
      { "institution": "Shrimanta Shankar Academy, Guwahati", "degree": "Higher Secondary" }
    ],
    "truncated": false
  },

  "skills": {
    "items": [
      { "name": "Chrome Extensions", "demonstratedIn": ["SDE at Attack Capital"] },
      { "name": "Prisma",            "demonstratedIn": ["2 experiences at Attack Capital"] },
      { "name": "Next.js",           "demonstratedIn": ["4 experiences at Attack Capital and 2 other companies"] },
      { "name": "SQL",               "demonstratedIn": ["SQL (Basic) Skills Certification Test", "SQL (Intermediate) Skills Certification Test"] },
      { "name": "FastAPI" }
    ],
    "totalCount": 39,
    "truncated": false
  },

  "certifications": {
    "items": [
      {
        "name": "SQL (Intermediate) Skills Certification Test",
        "issuer": "HackerRank",
        "issuedDate": "Jun 2025",
        "credentialId": "40FB6BFD2D39"
      },
      {
        "name": "Postman API Fundamentals Student Expert",
        "issuer": "Canvas Credentials (Badgr)",
        "issuedDate": "Dec 2024",
        "credentialId": "675eb9d8e2438a4c735185c7"
      }
    ],
    "totalCount": 8,
    "truncated": true
  },

  "volunteer": {
    "items": [
      {
        "role": "Technical Director",
        "organization": "DCODE",
        "startDate": "Aug 2025",
        "endDate": "May 2026",
        "duration": "10 mos"
      },
      {
        "role": "Management Coordinator",
        "organization": "GDGC-Jorhat Engineering College",
        "startDate": "Sep 2024",
        "endDate": "Jun 2025",
        "duration": "10 mos"
      }
    ],
    "totalCount": 4,
    "truncated": true
  },

  "projects": { "items": [], "truncated": false },

  "extractionWarnings": [
    "certifications: expansion is not yet available; returning the profile-card preview",
    "volunteer: expansion is not yet available; returning the profile-card preview",
    "projects: expansion is not yet available; returning the profile-card preview"
  ],
  "fetchedAt": "2026-08-31T14:11:23.123Z",
  "cached": false
}
```

**Reading this response.** The three expanded sections show `"truncated":
false` — the full lists were retrieved (39 skills, all six employers, all
three schools). `certifications` and `volunteer` show `"truncated": true` with
a `totalCount` larger than `items.length`, and the warnings explain exactly
why. `projects` is genuinely empty for this member — not an error. Nothing is
silently missing.

---

### 6.3 `GET /api/profile/{vanityName}/sections/{section}`

One section as a sub-resource, for a caller that already holds the preview and
wants to drill into a single section without re-fetching the rest.

**Path parameters**

| Param | Description |
|---|---|
| `vanityName` | The last path segment of the profile URL. A bare name is accepted here — position in the path makes it unambiguous |
| `section` | One of `experience`, `education`, `skills`, `certifications`, `volunteer`, `projects`. **`about` is not valid** — it is a single text block, not a collection, and returns `400` |

#### Example request

```http
GET /api/profile/shaswata-gogoi/sections/education
Host: localhost:3000
```

#### Example response — `200 OK`

```json
{
  "vanityName": "shaswata-gogoi",
  "section": "education",
  "items": [
    {
      "institution": "Jorhat Engineering College",
      "degree": "Bachelor of Technology - BTech, Computer Science and Engineering",
      "startDate": "Oct 2022",
      "endDate": "Jul 2026"
    },
    { "institution": "Shrimanta Shankar Academy, Guwahati", "degree": "Senior Secondary" },
    { "institution": "Shrimanta Shankar Academy, Guwahati", "degree": "Higher Secondary" }
  ],
  "truncated": false,
  "extractionWarnings": [],
  "fetchedAt": "2026-08-31T14:11:23.123Z",
  "cached": true
}
```

Note the two `Shrimanta Shankar Academy` entries with different degrees. Both
are real and distinct, and neither carries dates — a shape the card-based
parser could not fully resolve, but the details endpoint can, because it gives
each entry its own structural boundary.

---

### 6.4 `GET /health`

```json
{ "status": "ok", "uptimeSeconds": 143 }
```

---

### 6.5 Entity schemas

**`ExperienceEntry`** — one *company*. `positions.length > 1` means a promotion
history at that company; LinkedIn groups those under a single entry rather than
repeating the company.

| Field | Type | Notes |
|---|---|---|
| `companyName` | string | required |
| `employmentType` | string? | `Full-time`, `Internship`, … |
| `totalDuration` | string? | Present on grouped entries |
| `location` / `locationType` | string? | Company-level; deliberately **not** copied onto positions, because LinkedIn does not assert it applies to each role |
| `skills` | string[]? | Only from an expanded fetch |
| `unnamedSkillCount` | number? | Skills LinkedIn counted but did not name (`"+9 skills"`), so `skills.length` is never mistaken for the total |
| `positions` | Position[] | required |

**`Position`** — `title` (required), `employmentType?`, `startDate`, `endDate`,
`duration?`, `location?`, `locationType?`, `description?`.

**`EducationEntry`** — `institution` (required), `degree?`, `startDate?`,
`endDate?`, `grade?`, `activities?`, `description?`. Dates are frequently
absent; some entries carry only a completion date, which maps to `endDate`.

**`SkillEntry`** — `name` (required), `endorsementCount?`, `endorsedBy?`,
`demonstratedIn?`. `demonstratedIn` is kept verbatim because its forms are
open-ended — a role, a project or a certification.

**`CertificationEntry`** — `name` (required), `issuer?`, `issuedDate?`,
`expirationDate?`, `credentialId?`.

**`VolunteerEntry`** — `role`, `organization` (both required), `startDate?`,
`endDate?`, `duration?`, `cause?`, `description?`.

**`ProjectEntry`** — `title`, `startDate`, `endDate` (required),
`associatedWith?`, `description?`.

---

### 6.6 Errors

All errors share one shape:

```json
{ "error": { "code": "BAD_REQUEST", "message": "Could not read a profile from \"nonsense\". Expected a URL like https://www.linkedin.com/in/example" } }
```

| Status | Code | Cause |
|---|---|---|
| `400` | `BAD_REQUEST` | Missing/malformed `url`, unknown `expand` value, unknown section, or `about` requested as a section |
| `404` | `NOT_FOUND` | Profile not found or not publicly accessible |
| `429` | `RATE_LIMITED` | Inbound per-IP limit exceeded. Carries `Retry-After` (seconds) |
| `502` | `UPSTREAM_FAILURE` | Nothing at all could be retrieved. A *partial* failure is not a 502 — it becomes a warning |
| `504` | `UPSTREAM_TIMEOUT` | LinkedIn did not respond in time |
| `500` | `INTERNAL_ERROR` | Unhandled fault. The message is deliberately generic, since upstream errors can carry session-shaped detail |

**Unknown paths redirect.** Any unrecognised path — including `/` — returns a
`302` to `/docs` rather than a dead-end 404.

### 6.7 Performance expectations

| Scenario | Upstream calls | Approx. time |
|---|---|---|
| Cold profile, no expand | 5 | ~6 s (paced by the outbound throttle) |
| Same profile again | 0 | milliseconds, `"cached": true` |
| `expand` of one section | +1 per page of 10 | +1.2 s per page |
| `forceRefresh=true` | Full cost again | — |

The latency is deliberate. It is the outbound throttle protecting the account,
not slow code.

---

## 7. Testing

The whole stack is tested **offline against captured HAR fixtures** — no
network, no credentials. This was a deliberate choice: live tests would be
non-deterministic (LinkedIn's component keys are per-render UUIDs and profiles
change), and every run would spend account quota.

| Suite | Covers |
|---|---|
| `test-experience-edgecases` | 9 profiles + ~25 synthetic cases for every optional field's absence |
| `test-education-edgecases` | 11 profiles + missing degree/dates/grade, all-dateless, coursework blocks |
| `test-skills-edgecases` | 12 profiles + project/course contexts, placeholder nodes |
| `test-about-edgecases` | Multi-paragraph, absent, invisible characters |
| `test-topcard-edgecases` | 6 profiles including no-photo and non-English names |
| `test-orchestrator` | Assembly, envelope contract, expand, caching, throttling, every HTTP status |
| `test-request-bodies` | Our outgoing requests vs LinkedIn's captured ones, field by field |
| `test-openapi-contract` | The docs describe the service that actually exists |

Two of these exist because of bugs that got through:

**`test-request-bodies`** exists because a HAR replays a *response*, so a
malformed outgoing *request* still passes offline. Two real bugs hid in that
blind spot — a missing required block in the pagination body, and one section
being sent another section's payload shape.

**`test-openapi-contract`** ties the documentation to the code: the `expand`
documentation cannot claim a section is expandable when no parser exists for
it, and that stays true automatically as sections are added.

---

## 8. Known limitations

Stated plainly rather than buried.

- **Three sections cannot yet be expanded.** `certifications`, `volunteer` and
  `projects` return the card preview plus a warning. Each needs one traffic
  capture to confirm its retrieval mechanism — and I would not guess, because
  the two mechanisms I *have* verified turned out to use *different* request
  shapes from each other.
- **LinkedIn's frontend is a moving target.** Component naming varied across
  captures taken days apart. The parsers degrade per-section rather than
  failing wholesale, and the fixture suites catch regressions in seconds, but a
  broad redesign would require rework.
- **`truncated` can be `true` with no `totalCount`.** LinkedIn does not always
  publish a count; the flag then comes from the presence of a "Show all"
  affordance. `totalCount: undefined` means *unknown*, not *none*.
- **Not a production scraping service.** Deliberately rate-limited and
  cache-first, at low volume, on a dedicated account.
- **Legal/ToS.** Operating outside LinkedIn's Terms carries real risk up to
  account suspension and, at commercial scale, legal action. This is scoped as
  a technical demonstration.

---

## 9. Summary

- Purely reverse-engineered, **no browser** anywhere in the runtime
- Decodes React Flight; parses positionally-encoded data using structural
  boundaries first and content classification second — never positional guesses
- **Account safety designed in**: separate inbound and outbound limiters,
  fetch-layer caching, page sizes matched to LinkedIn's own client, and a
  development process that spent zero quota
- **Honest output**: truncation is reported, partial failures degrade to
  warnings, and the API never presents a preview as a complete list
- Interactive Swagger reference at `/docs` with live request execution
