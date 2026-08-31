import { SECTION_KEYS } from '../types/sections';
import { SECTION_REGISTRY } from '../linkedin/sectionRegistry';
import { DETAILS_PAGE_SIZE } from '../linkedin/client';


const EXPANDABLE_SECTIONS = SECTION_REGISTRY.filter((s) => s.detailsParser).map((s) => s.key);

const NOT_YET_EXPANDABLE = SECTION_REGISTRY.filter((s) => !s.detailsParser).map((s) => s.key);

const COLLECTION_SECTIONS = SECTION_KEYS.filter((k) => k !== 'about');

const nullableString = { type: 'string' } as const;

function envelope(itemsRef: string, description: string) {
  return {
    type: 'object',
    description,
    required: ['items', 'truncated'],
    properties: {
      items: { type: 'array', items: { $ref: `#/components/schemas/${itemsRef}` } },
      totalCount: {
        type: 'integer',
        description:
          'How many entries LinkedIn actually holds for this section. Usually LARGER than ' +
          '`items.length`, because the profile card returns only a preview. Absent when ' +
          'LinkedIn gave no count — treat that as "unknown", not as "nothing more exists".',
      },
      truncated: {
        type: 'boolean',
        description:
          'True when you are looking at a preview rather than the whole list. Set either ' +
          'because `totalCount` exceeds `items.length`, or because LinkedIn rendered a ' +
          '"Show all" affordance for the section. Use `?expand=` to fill it in.',
      },
    },
  };
}

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'LinkedIn Profile API',
    version: '1.0.0',
    description: [
      'Accepts a LinkedIn profile URL and returns structured JSON: topcard, about,',
      'experience, education, skills, certifications, volunteering and projects.',
      '',
      '## How it works',
      '',
      'The data is obtained by **direct HTTP calls to LinkedIn endpoints** — no browser',
      'automation, no headless rendering. Profile sections arrive as Server-Driven UI',
      "components in React's Flight wire format and are decoded and parsed; the topcard",
      'comes from the profile page document, which is plain server-rendered HTML.',
      '',
      '## Previews and truncation — read this first',
      '',
      'LinkedIn\'s profile card returns only about **two entries per section**. Every',
      'list section is therefore returned in a fixed envelope:',
      '',
      '```json',
      '{ "items": [ ... ], "totalCount": 39, "truncated": true }',
      '```',
      '',
      '`totalCount` is the real number of entries; `truncated` says you are seeing a',
      'preview. Returning only `items` would be lying by omission — a caller would have',
      'no way to know it received 2 of 39 skills.',
      '',
      '**The envelope shape never changes.** `?expand=` alters only `items.length` and',
      '`truncated`, so there is one response type to consume regardless.',
      '',
      '## Cost of a request',
      '',
      'A cold profile costs **5 upstream LinkedIn requests** (4 component cards + 1 page',
      `document). Each expanded section adds at least one more, paged ${DETAILS_PAGE_SIZE} entries at a`,
      'time. Upstream calls are spaced by a global throttle, so a cold request takes',
      'several seconds; a repeat is served from cache and returns `"cached": true`.',
      '',
      '**If you are using "Try it out" below, please be aware each uncached call spends',
      'real quota against a rate-limited LinkedIn account.** Repeats of the same profile',
      'are cheap; new profiles and `expand` are not.',
      '',
      '## Partial failure',
      '',
      'A section that fails to fetch or parse degrades to an empty envelope and adds an',
      'entry to `extractionWarnings`; it never fails the whole request. When something',
      'looks wrong or short, `extractionWarnings` is the first place to look. Only a',
      'total upstream failure produces a 502.',
      '',
      '## Authentication',
      '',
      'This API requires none. LinkedIn session credentials are held server-side and are',
      'never accepted from, or exposed to, callers.',
    ].join('\n'),
  },
  servers: [
    { url: '/', description: 'This server' },
  ],
  tags: [
    { name: 'Profile', description: 'Profile retrieval' },
    { name: 'Service', description: 'Service health' },
  ],
  paths: {
    '/api/profile': {
      get: {
        tags: ['Profile'],
        summary: 'Fetch a profile',
        description: [
          'Returns the topcard, about text and every section as a preview envelope.',
          '',
          'Add `?expand=` to fetch one or more sections in full.',
        ].join('\n'),
        operationId: 'getProfile',
        parameters: [
          {
            name: 'url',
            in: 'query',
            required: true,
            description: [
              'Full LinkedIn profile URL, e.g. `https://www.linkedin.com/in/shaswata-gogoi`.',
              'A scheme-less form (`linkedin.com/in/x`) and regional hosts (`in.linkedin.com`)',
              'are accepted.',
              '',
              '**A bare word such as `shaswata-gogoi` is rejected here on purpose.** Profile',
              'targeting is by vanity name alone, so a typo would silently return a',
              'DIFFERENT member\'s profile rather than a 404. Use the path parameter on the',
              'section endpoint if you want to pass a bare vanity name.',
            ].join('\n'),
            schema: { type: 'string' },
            example: 'https://www.linkedin.com/in/shaswata-gogoi',
          },
          {
            name: 'expand',
            in: 'query',
            required: false,
            description: [
              'Comma-separated sections to return in FULL instead of the card preview, or',
              '`all`.',
              '',
              'Granular rather than a boolean because each expanded section costs additional',
              'upstream requests against a rate-limited account — a caller who wants full',
              'education should not pay for full experience.',
              '',
              `Currently served in full: \`${EXPANDABLE_SECTIONS.join('`, `')}\`.`,
              NOT_YET_EXPANDABLE.length
                ? `Accepted but not yet available (returns the preview plus a warning): \`${NOT_YET_EXPANDABLE.join('`, `')}\`.`
                : '',
            ]
              .filter(Boolean)
              .join('\n'),
            schema: { type: 'string' },
            example: 'skills,education',
          },
          {
            name: 'forceRefresh',
            in: 'query',
            required: false,
            description:
              'Bypass the cache and re-fetch everything for this profile, including any ' +
              'previously fetched detail pages. Costs full upstream quota — use sparingly.',
            schema: { type: 'boolean', default: false },
          },
        ],
        responses: {
          200: {
            description: 'Profile data. May contain `extractionWarnings` even on success.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProfileData' },
                examples: {
                  preview: {
                    summary: 'Preview (no expand) — note the truncated sections',
                    value: {
                      profileUrl: 'https://www.linkedin.com/in/shaswata-gogoi',
                      vanityName: 'shaswata-gogoi',
                      name: 'Shaswata Gogoi',
                      headline: 'Engineering @Attack Capital (YC W22)',
                      location: 'Guwahati, Assam, India',
                      pronouns: 'He/Him',
                      profileImageUrl:
                        'https://media.licdn.com/dms/image/v2/D4D03AQEBAAL1EjCIYA/profile-displayphoto-crop_800_800/…',
                      about:
                        'Over the past 1.5+ years, I have been building production-grade applications at fast-paced startups. Currently working as a software developer at Attack Capital (YC-backed)…',
                      experience: {
                        items: [
                          {
                            companyName: 'Attack Capital',
                            totalDuration: '8 mos',
                            location: 'New York, United States',
                            locationType: 'Remote',
                            positions: [
                              {
                                title: 'SDE',
                                employmentType: 'Full-time',
                                startDate: 'Jun 2026',
                                endDate: 'Present',
                                duration: '3 mos',
                              },
                              {
                                title: 'Full Stack Developer',
                                employmentType: 'Internship',
                                startDate: 'Jan 2026',
                                endDate: 'May 2026',
                                duration: '5 mos',
                              },
                            ],
                          },
                        ],
                        truncated: true,
                      },
                      education: {
                        items: [
                          {
                            institution: 'Jorhat Engineering College',
                            degree: 'Bachelor of Technology - BTech, Computer Science and Engineering',
                            startDate: 'Oct 2022',
                            endDate: 'Jul 2026',
                          },
                        ],
                        truncated: true,
                      },
                      skills: {
                        items: [
                          { name: 'Chrome Extensions', demonstratedIn: ['SDE at Attack Capital'] },
                          { name: 'Twilio', demonstratedIn: ['SDE at Attack Capital'] },
                        ],
                        totalCount: 39,
                        truncated: true,
                      },
                      certifications: {
                        items: [
                          {
                            name: 'SQL (Intermediate) Skills Certification Test',
                            issuer: 'HackerRank',
                            issuedDate: 'Jun 2025',
                            credentialId: '40FB6BFD2D39',
                          },
                        ],
                        totalCount: 8,
                        truncated: true,
                      },
                      volunteer: {
                        items: [
                          {
                            role: 'Technical Director',
                            organization: 'DCODE',
                            startDate: 'Aug 2025',
                            endDate: 'May 2026',
                            duration: '10 mos',
                          },
                        ],
                        totalCount: 4,
                        truncated: true,
                      },
                      projects: { items: [], truncated: false },
                      extractionWarnings: [],
                      fetchedAt: '2026-08-31T14:11:23.123Z',
                      cached: false,
                    },
                  },
                  expanded: {
                    summary: 'expand=skills — truncated clears once the full list is retrieved',
                    value: {
                      profileUrl: 'https://www.linkedin.com/in/shaswata-gogoi',
                      vanityName: 'shaswata-gogoi',
                      name: 'Shaswata Gogoi',
                      skills: {
                        items: [
                          { name: 'Chrome Extensions', demonstratedIn: ['SDE at Attack Capital'] },
                          { name: 'Prisma', demonstratedIn: ['2 experiences at Attack Capital'] },
                          {
                            name: 'Next.js',
                            demonstratedIn: ['4 experiences at Attack Capital and 2 other companies'],
                          },
                          {
                            name: 'SQL',
                            demonstratedIn: [
                              'SQL (Basic) Skills Certification Test',
                              'SQL (Intermediate) Skills Certification Test',
                            ],
                          },
                          { name: 'FastAPI' },
                        ],
                        totalCount: 39,
                        truncated: false,
                      },
                      extractionWarnings: [],
                      fetchedAt: '2026-08-31T14:11:23.123Z',
                      cached: false,
                    },
                  },
                  degraded: {
                    summary: 'Partial failure — one section warns, the request still succeeds',
                    value: {
                      profileUrl: 'https://www.linkedin.com/in/shaswata-gogoi',
                      vanityName: 'shaswata-gogoi',
                      name: 'Shaswata Gogoi',
                      certifications: {
                        items: [
                          {
                            name: 'Postman API Fundamentals Student Expert',
                            issuer: 'Canvas Credentials (Badgr)',
                            issuedDate: 'Dec 2024',
                            credentialId: '675eb9d8e2438a4c735185c7',
                          },
                        ],
                        totalCount: 8,
                        truncated: true,
                      },
                      extractionWarnings: [
                        'certifications: expansion is not yet available; returning the profile-card preview',
                      ],
                      fetchedAt: '2026-08-31T14:11:23.123Z',
                      cached: true,
                    },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          404: { $ref: '#/components/responses/NotFound' },
          429: { $ref: '#/components/responses/RateLimited' },
          502: { $ref: '#/components/responses/UpstreamFailure' },
          504: { $ref: '#/components/responses/UpstreamTimeout' },
        },
      },
    },

    '/api/profile/{vanityName}/sections/{section}': {
      get: {
        tags: ['Profile'],
        summary: 'Fetch one section',
        description: [
          'Returns a single section as a sub-resource, fetched in full where supported.',
          '',
          'Useful when you already hold the preview and want to drill into one section',
          'without re-fetching the rest.',
        ].join('\n'),
        operationId: 'getProfileSection',
        parameters: [
          {
            name: 'vanityName',
            in: 'path',
            required: true,
            description:
              'The profile\'s vanity name — the last path segment of its URL. A bare name is ' +
              'accepted here because the position in the path makes it unambiguous.',
            schema: { type: 'string' },
            example: 'shaswata-gogoi',
          },
          {
            name: 'section',
            in: 'path',
            required: true,
            description:
              'Which section to return. `about` is not valid here: it is a single text ' +
              'block rather than a collection, and is available from `GET /api/profile`.',
            schema: { type: 'string', enum: [...COLLECTION_SECTIONS] },
            example: 'education',
          },
        ],
        responses: {
          200: {
            description: 'One section envelope, plus request metadata.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SectionResponse' },
                example: {
                  vanityName: 'example',
                  section: 'education',
                  items: [
                    {
                      institution: 'Jorhat Engineering College',
                      degree: 'Bachelor of Technology - BTech, Computer Science and Engineering',
                      startDate: 'Oct 2022',
                      endDate: 'Jul 2026',
                    },
                    { institution: 'Shrimanta Shankar Academy', degree: 'Senior Secondary' },
                  ],
                  truncated: false,
                  extractionWarnings: [],
                  fetchedAt: '2026-08-31T10:00:00.000Z',
                  cached: false,
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          404: { $ref: '#/components/responses/NotFound' },
          429: { $ref: '#/components/responses/RateLimited' },
          502: { $ref: '#/components/responses/UpstreamFailure' },
          504: { $ref: '#/components/responses/UpstreamTimeout' },
        },
      },
    },

    '/health': {
      get: {
        tags: ['Service'],
        summary: 'Liveness probe',
        operationId: 'getHealth',
        responses: {
          200: {
            description: 'The service is up.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    uptimeSeconds: { type: 'integer', example: 143 },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  components: {
    responses: {
      BadRequest: {
        description:
          'Missing or malformed `url`, an unknown `expand` value, or an unknown section.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: {
              error: {
                code: 'BAD_REQUEST',
                message:
                  'Could not read a profile from "nonsense". Expected a URL like https://www.linkedin.com/in/example',
              },
            },
          },
        },
      },
      NotFound: {
        description: 'Profile not found or not publicly accessible.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { error: { code: 'NOT_FOUND', message: 'Profile not found or not publicly accessible.' } },
          },
        },
      },
      RateLimited: {
        description:
          'This API\'s own per-IP limit was exceeded. The `Retry-After` header gives the ' +
          'seconds to wait. Note this is separate from the outbound throttle that paces ' +
          'calls to LinkedIn.',
        headers: {
          'Retry-After': { schema: { type: 'integer' }, description: 'Seconds until the window resets.' },
        },
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { error: { code: 'RATE_LIMITED', message: 'Rate limit of 5 requests/minute exceeded.' } },
          },
        },
      },
      UpstreamFailure: {
        description: 'Nothing could be retrieved from LinkedIn. A PARTIAL failure is not a 502 — it becomes a warning.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { error: { code: 'UPSTREAM_FAILURE', message: 'Failed to retrieve profile data.' } },
          },
        },
      },
      UpstreamTimeout: {
        description: 'LinkedIn did not respond in time.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { error: { code: 'UPSTREAM_TIMEOUT', message: 'Upstream request timed out.' } },
          },
        },
      },
    },

    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: {
                type: 'string',
                enum: [
                  'BAD_REQUEST',
                  'NOT_FOUND',
                  'RATE_LIMITED',
                  'UPSTREAM_FAILURE',
                  'UPSTREAM_TIMEOUT',
                  'INTERNAL_ERROR',
                ],
              },
              message: { type: 'string' },
            },
          },
        },
      },

      Position: {
        type: 'object',
        description: 'One role. A company with a promotion history has several.',
        required: ['title', 'startDate', 'endDate'],
        properties: {
          title: nullableString,
          employmentType: { type: 'string', example: 'Full-time' },
          startDate: { type: 'string', example: 'Jun 2022' },
          endDate: { type: 'string', example: 'Present' },
          duration: { type: 'string', example: '2 yrs 3 mos' },
          location: { type: 'string', example: 'Bengaluru, Karnataka, India' },
          locationType: { type: 'string', enum: ['On-site', 'Remote', 'Hybrid'] },
          description: nullableString,
        },
      },

      ExperienceEntry: {
        type: 'object',
        description:
          'One COMPANY. `positions.length > 1` means a promotion history at that company ' +
          '— LinkedIn groups those under a single entry rather than repeating the company.',
        required: ['companyName', 'positions'],
        properties: {
          companyName: nullableString,
          employmentType: { type: 'string', example: 'Full-time' },
          totalDuration: { type: 'string', example: '4 yrs 2 mos' },
          location: {
            type: 'string',
            description:
              'Company-level location, shown above the roles. Deliberately NOT copied onto ' +
              'individual positions: LinkedIn does not assert it applies to each one.',
          },
          locationType: { type: 'string', enum: ['On-site', 'Remote', 'Hybrid'] },
          skills: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Skills LinkedIn associates with this experience. Only present when the ' +
              'section was expanded — the profile card does not carry them.',
          },
          unnamedSkillCount: {
            type: 'integer',
            description:
              'Further skills LinkedIn counted but did not name ("+5 skills"). Reported ' +
              'separately so `skills.length` is never mistaken for the true total.',
          },
          positions: { type: 'array', items: { $ref: '#/components/schemas/Position' } },
        },
      },

      EducationEntry: {
        type: 'object',
        required: ['institution'],
        properties: {
          institution: nullableString,
          degree: { type: 'string', example: 'Bachelor of Technology - BTech, Computer Science' },
          startDate: {
            type: 'string',
            description: 'Absent when LinkedIn shows only a completion date, or no dates at all.',
          },
          endDate: { type: 'string', example: 'Jul 2026' },
          grade: { type: 'string', example: '9.16 CGPA' },
          activities: { type: 'string', example: 'Robotics Club' },
          description: nullableString,
        },
      },

      SkillEntry: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', example: 'Chrome Extensions' },
          endorsementCount: { type: 'integer', example: 53 },
          endorsedBy: {
            type: 'array',
            items: { type: 'string' },
            description: 'Verbatim endorsement lines, e.g. "Endorsed by 2 colleagues at Acme".',
          },
          demonstratedIn: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Where the skill was demonstrated — a role, a project or a course. Kept ' +
              'verbatim because the forms are open-ended.',
          },
        },
      },

      CertificationEntry: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', example: 'SQL (Intermediate) Skills Certification Test' },
          issuer: { type: 'string', example: 'HackerRank' },
          issuedDate: { type: 'string', example: 'Jun 2025' },
          expirationDate: { type: 'string' },
          credentialId: { type: 'string', example: '40FB6BFD2D39' },
        },
      },

      VolunteerEntry: {
        type: 'object',
        required: ['role', 'organization'],
        properties: {
          role: { type: 'string', example: 'Technical Director' },
          organization: { type: 'string', example: 'DCODE' },
          startDate: { type: 'string', example: 'Aug 2025' },
          endDate: { type: 'string', example: 'May 2026' },
          duration: { type: 'string', example: '10 mos' },
          cause: { type: 'string', example: 'Education' },
          description: { type: 'string' },
        },
      },

      ProjectEntry: {
        type: 'object',
        required: ['title', 'startDate', 'endDate'],
        properties: {
          title: { type: 'string', example: 'Internal Analytics Dashboard' },
          startDate: { type: 'string', example: 'Jan 2025' },
          endDate: { type: 'string', example: 'Apr 2025' },
          associatedWith: { type: 'string' },
          description: { type: 'string' },
        },
      },

      ProfileData: {
        type: 'object',
        required: [
          'profileUrl',
          'vanityName',
          ...COLLECTION_SECTIONS,
          'extractionWarnings',
          'fetchedAt',
          'cached',
        ],
        properties: {
          profileUrl: { type: 'string', example: 'https://www.linkedin.com/in/example' },
          vanityName: { type: 'string', example: 'example' },
          name: { type: 'string', description: 'From the profile page document, not the section cards.' },
          headline: { type: 'string' },
          location: { type: 'string' },
          pronouns: { type: 'string', example: 'He/Him' },
          profileImageUrl: {
            type: 'string',
            description: 'Absent when the member has no photo — LinkedIn shows a ghost avatar and emits no image.',
          },
          bannerImageUrl: { type: 'string' },
          about: { type: 'string', description: 'Paragraphs joined by blank lines. Absent when the member has no About section.' },
          experience: envelope('ExperienceEntry', 'Work history, grouped by company.'),
          education: envelope('EducationEntry', 'Schools and degrees.'),
          skills: envelope('SkillEntry', 'Skills with endorsement and context information.'),
          certifications: envelope('CertificationEntry', 'Licenses and certifications.'),
          volunteer: envelope('VolunteerEntry', 'Volunteering experience.'),
          projects: envelope('ProjectEntry', 'Projects.'),
          extractionWarnings: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Per-section problems and truncation notices. A section that fails degrades ' +
              'to an empty envelope and a warning here rather than failing the request, so ' +
              'this is the first place to look when a result seems short or wrong.',
            example: ['skills: expansion is not yet available; returning the profile-card preview'],
          },
          fetchedAt: { type: 'string', format: 'date-time' },
          cached: {
            type: 'boolean',
            description:
              'True only when EVERY upstream fetch for this response was served from cache. ' +
              'A single live fetch — including a detail page — makes it false.',
          },
        },
      },

      SectionResponse: {
        type: 'object',
        description: 'A single section envelope, flattened, plus request metadata.',
        required: ['vanityName', 'section', 'items', 'truncated', 'extractionWarnings', 'fetchedAt', 'cached'],
        properties: {
          vanityName: { type: 'string' },
          section: { type: 'string', enum: [...COLLECTION_SECTIONS] },
          items: {
            type: 'array',
            description: 'Entries of the type matching `section`.',
            items: {
              oneOf: [
                { $ref: '#/components/schemas/ExperienceEntry' },
                { $ref: '#/components/schemas/EducationEntry' },
                { $ref: '#/components/schemas/SkillEntry' },
                { $ref: '#/components/schemas/CertificationEntry' },
                { $ref: '#/components/schemas/VolunteerEntry' },
                { $ref: '#/components/schemas/ProjectEntry' },
              ],
            },
          },
          totalCount: { type: 'integer' },
          truncated: { type: 'boolean' },
          extractionWarnings: { type: 'array', items: { type: 'string' } },
          fetchedAt: { type: 'string', format: 'date-time' },
          cached: { type: 'boolean' },
        },
      },
    },
  },
} as const;
