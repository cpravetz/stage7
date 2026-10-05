# Career Coach User Guide

Everything you need to run Stage7 as a job search assistant and nothing else.

This guide is for one specific kind of user: **you want a job search assistant, not a general AI
platform.** Stage7 ships with 21 assistants, and you do not need the other 20. This guide walks you
through loading the Career Coach on its own, configuring it, and then using its skills day to day.

- **Time to set up:** roughly 20 minutes, plus a few minutes per job search cycle
- **Cost:** free, if you follow the free-model options in [Step 4](#step-4-connect-an-ai-model)
- **Works on:** Windows, Mac, and Linux
- **Assumed knowledge:** none. You need Docker and a browser. Nothing else.

---

## Contents

- [What the Career Coach is](#what-the-career-coach-is)
- [What you need before you start](#what-you-need-before-you-start)
- [Part 1: Set up the Career Coach](#part-1-set-up-the-career-coach)
- [Part 2: Configure the Career Coach](#part-2-configure-the-career-coach)
- [Part 3: Use the skills](#part-3-use-the-skills)
- [Reading the status a skill returns](#reading-the-status-a-skill-returns)
- [A sensible order to work in](#part-4-a-sensible-order-to-work-in)
- [Everyday commands](#everyday-commands)
- [If something goes wrong](#if-something-goes-wrong)
- [Safety and privacy](#safety-and-privacy)
- [Where your data lives](#where-your-data-lives)
- [Glossary](#glossary)

---

## What the Career Coach is

The Career Coach is one assistant inside Stage7, identified internally as `career`. It covers the whole
job search lifecycle:

| Stage | What happens |
| --- | --- |
| Your profile | Stage7 learns who you are and what you want, and stores your resume |
| Finding roles | It reads real job boards and ranks every role against your profile |
| Applying | It tailors your resume and cover letter and prepares your applications |
| Interviewing | It builds company-specific briefings, negotiation scripts, and mock interviews |
| Tracking | It records what you applied to and what came back |
| Closing gaps | It tells you which skills stand between you and a role you nearly qualify for |

It is a **coach**, not an agency. It reads public job boards, scores things, drafts material, and keeps
your records. It does not send anything without your confirmation, and it does not invent employers,
salaries, or job listings to fill a gap.

## What you need before you start

- A computer with **Docker Desktop** (Windows or Mac) or **Docker Engine** (Linux)
- About 8 GB of free memory
- One AI model, either free and local or free with a cloud account. See
  [Step 4](#step-4-connect-an-ai-model)

You do not need a job board account, an API key for job boards, a database, a credit card, or any
coding tools. The job search skills read public job board feeds that require no key at all.

---

## Part 1: Set up the Career Coach

### Step 1: Install Docker

Docker is the software that runs Stage7 for you. You install it once.

1. Go to <https://docs.docker.com/get-docker/>.
2. Download and install Docker Desktop for your operating system.
3. Start Docker Desktop and wait until it reports that it is running. On Linux, start the Docker
   service instead.

That is the only prerequisite.

### Step 2: Get the Stage7 files

1. Download or clone the Stage7 project into a folder on your computer, for example `stage7`.
2. Open that folder. Everything from here on happens there.

From a terminal:

```bash
git clone https://github.com/cpravetz/stage7.git
cd stage7
```

### Step 3: Load the Career Coach only

Out of the box Stage7 loads all 21 assistants. You only want one, so you tell Stage7 which one.

Stage7 keeps its settings in a plain text file called `.env` in your project folder. If it does not
exist yet, make a copy of the sample file:

| Your system | Command |
| --- | --- |
| Windows | `copy .env.example .env` |
| Mac or Linux | `cp .env.example .env` |

Open `.env` in any text editor and find this line:

```dotenv
STAGE7_ASSISTANTS=
```

Change it so it reads:

```dotenv
STAGE7_ASSISTANTS=career
```

That single word, `career`, is the assistant's internal ID. It is what loads the Career Coach and
nothing else.

Leave every other line alone for now. You will come back to this file in
[Step 4](#step-4-connect-an-ai-model) and in [Part 2](#part-2-configure-the-career-coach).

> **This setting is applied at build time, not at start time.** Choosing `career` prunes the other
> assistants out of the image during the build. A restart alone will not do it; you need to run the
> setup script again in [Step 5](#step-5-run-the-setup-script).

### Step 4: Connect an AI model

The Career Coach uses an AI model to write your answers, tailor your resume, draft your outreach, and
run your mock interviews. You need to point it at one. Every option below is free.

#### Option A: Run the model on your own computer

The best option if you want nothing to leave your machine.

1. Download and install **Ollama** from <https://ollama.com/download>.
2. Open a terminal and run `ollama pull llama3.2`. You only do this once.
3. In your `.env` file, change the Ollama setting to this value:

   ```dotenv
   OLLAMA_API_BASE=http://host.docker.internal:11434/v1
   ```

4. Save the file.

#### Option B: Use a free cloud account

If you would rather install nothing, use one of these. Both have free tiers.

**OpenRouter** - one account, many models, generous free tier.

```dotenv
OPENROUTER_API_KEY=paste-your-key-here
```

**Hugging Face** - a free token, free open models.

```dotenv
HUGGINGFACE_API_KEY=paste-your-token-here
```

**Cloudflare Workers AI** - a free allocation of inference.

```dotenv
CLOUDFLARE_WORKERS_AI_API_TOKEN=paste-your-token-here
CLOUDFLARE_WORKERS_AI_ACCOUNT_ID=paste-your-account-id-here
```

#### Which one should you pick?

| If you want | Use |
| --- | --- |
| Nothing sent to the internet, zero cost forever | Option A (Ollama) |
| No extra software, works immediately | Option B (OpenRouter) |

A practical combination is Ollama as your everyday model plus one free cloud account as a backup.

#### How to stay free

Leave every other provider line in `.env` empty. Stage7 only uses a provider you have given it a key,
so a blank line means that provider is switched off. There is no subscription and nothing is billed
unless you supply a paid key yourself.

### Step 5: Run the setup script

This step installs and starts everything. It takes a few minutes because Stage7 builds itself. The
first run is the slowest; later starts take seconds.

**Windows**, the easy way with no typing:

1. Double-click **`setup.bat`** in your project folder.
2. Press a key each time it asks you to continue.
3. When it asks which assistants to load, type `career` and press Enter.
4. Leave the window open until it reports that setup is complete.

**Windows**, from a terminal:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

**Mac or Linux**, from a terminal:

```bash
./setup.sh
```

Whichever route you take, the script asks which assistants to load. Type `career` when it does. If you
already edited `.env` in [Step 3](#step-3-load-the-career-coach-only), the script picks up your
setting and skips the question.

### Step 6: Sign in and open the Career Coach

1. Open your web browser and go to <http://localhost:8080>.
2. Sign in with the account you created. The seeded administrator is in your `.env` file as
   `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
3. In the left-hand menu, open **Assistants**.
4. Find the row named **Career Coach** and click **Open**.

You are now in the Career Coach workspace at `/entity/career`. This page has seven tabs, and three of
them matter to you:

| Tab | What it is for |
| --- | --- |
| **Overview** | Run your skills. This is where you will spend all your time |
| **Skill Settings** | Turn skills on or off, and change per-skill settings such as which job boards to search |
| **Configuration** | The assistant's instructions and knowledge notes |

There is no assistant picker or mode switch anywhere in the interface. Opening the Career Coach from the
**Assistants** list is the way in.

### Step 7: Turn on the free-model preference

One more click and Stage7 will prefer free and self-hosted models whenever it can.

1. In the left-hand menu, open **Settings**.
2. Tick **Prefer Free / Self-hosted Models**.
3. Click **Save Preferences**.

Worth knowing: this is a strong preference, not a hard block. If a request genuinely cannot be handled
by a free model, Stage7 may use a paid one - but only if you have set a paid key. If every paid key is
blank, you are safe by default.

### Step 8: Save your profile

Before any skill can do something useful, Stage7 needs to know who you are and what you are looking
for. This takes about five minutes and makes every other skill noticeably better.

1. In the Career Coach workspace, open **Overview**.
2. Find the **Profile Intake** skill and press **Save profile**.
3. Fill in what you know:

| What to give it | Why it matters |
| --- | --- |
| Target job titles | Decides which roles get ranked highly |
| Target companies | Boosts the ones you want to work for |
| Salary floor and ceiling | Filters and scores out roles that pay wrong |
| Preferred locations | Filters by what you actually want |
| Companies to avoid | Removes them from your results entirely |
| Key skills and keywords | Improves matching and your resume score |
| Your resume text | Used by the resume and positioning skills |

You do not need all of it to be perfect. Start with the essentials and add the rest later. Running
**Save profile** again updates your details without wiping what is already there.

Before you invest more time, do the one-time data persistence fix in
[Keep your job search data permanently](#keep-your-job-search-data-permanently). Otherwise a rebuild
clears everything you just typed.

---

## Part 2: Configure the Career Coach

### Where configuration lives

There are three places, and they are not interchangeable. Using the wrong one is the single most
common cause of a setting that appears to be ignored.

| Place | What you configure there | When to use it |
| --- | --- | --- |
| `.env` file | Which assistants load, where data is stored, which AI models are reachable | Once, at setup |
| **Skill Settings** tab | Per-skill behaviour: which boards to search, how many results, timeouts | When you want to change how a skill behaves |
| **Configuration** tab | The assistant's own instructions and knowledge notes | Rarely. Read it before you edit it |

### Environment variables that matter

Only four settings in `.env` affect the Career Coach.

| Variable | What it does | Default if unset |
| --- | --- | --- |
| `STAGE7_ASSISTANTS` | Which assistants load. Set to `career` | All 21 assistants load |
| `CAREER_HOME` | Folder where your profile, templates, roles, and application history are stored | A temporary folder that a rebuild clears |
| `BRAIN_URL` | Where the AI model service lives. Interview prep, mock interviews, and upskilling all call it | `http://brain:3100` |
| Your model key | One of `OLLAMA_API_BASE`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`, `GROK_API_KEY`, `OPENAI_API_KEY`, `NVIDIA_API_KEY`, `HUGGINGFACE_API_KEY`, or `CUSTOM_PROVIDERS` | No model available, prep skills report "not connected" |

That is the whole list. The Career Coach needs **no key for job boards**. Greenhouse, Ashby, Lever, and
the public remote-job feeds it reads are open APIs, so job searching works with zero configuration.

### Environment variables that look like they matter but do not

Your `.env.example` file contains four lines that begin with `CAREER_` and suggest they tune the
interview skills:

```dotenv
CAREER_DELEGATED_TIMEOUT_MS=24000
CAREER_BRAIN_FALLBACK_TIMEOUT_MS=19000
CAREER_BATTLECARD_BUDGET_MS=44000
CAREER_MOCK_INTERVIEW_BUDGET_MS=30000
```

**None of these are read by any code.** They are documentation of values that were once proposed. If
you change them, nothing happens, and if you delete them, nothing breaks.

The same applies to `CAREER_REQUEST_TIMEOUT_MS`, `CAREER_REQUEST_RETRIES`, `CAREER_PER_SOURCE_CONCURRENCY`,
and `CAREER_INTER_REQUEST_DELAY_MS`.

If you want to tune timeouts and concurrency, change the skill's configuration in the **Skill Settings**
tab instead. That is the only path the skills actually read.

### Keep your job search data permanently

Out of the box your profile, saved roles, and application history live in a temporary folder that a
rebuild clears. If you are going to spend time in here, do this once.

1. Open `docker-compose.yaml` in your project folder.
2. Find the `tool-executor:` service.
3. Add these two lines under its existing settings, keeping the indentation:

   ```yaml
       volumes:
         - career_data:/data/career
   ```

4. At the very bottom of the same file, in the existing `volumes:` section, add one line:

   ```yaml
     career_data:
   ```

5. In `.env`, add this line:

   ```dotenv
   CAREER_HOME=/data/career
   ```

6. Run the setup script again.

From now on your data survives rebuilds and restarts. You can confirm it worked by checking that a
file named `templates.json` has appeared inside the `career_data` volume after you save a template.

### Skill settings: what you can change per skill

Open the **Skill Settings** tab in the Career Coach workspace. Each skill has a **Settings** button,
and the fields it opens come from that skill's own configuration schema. Most skills have none. Two
career skills do.

**Job Search & Fit Ranking** - the search settings you are most likely to want:

| Setting | Default | What it does |
| --- | --- | --- |
| `maxPerBoard` | `50` | Maximum listings taken from each job board per run |
| `boardTokens` | empty | Pins the exact board name for a company, per platform |

**Job Discovery** - the underlying search tool, editable if you open it from the **Tools** page:

| Setting | Default | What it does |
| --- | --- | --- |
| `maxPerBoard` | `50` | Maximum listings kept per source |
| `maxPages` | `5` | Maximum pages read per paginating source |
| `detailLimit` | `20` | Maximum per-posting detail fetches per source |
| `enrichDescriptions` | `true` | Fetch full descriptions when a list payload omits them |
| `usePublicFeeds` | `true` | Consult company-agnostic public feeds. The only tier that works with no company named |
| `useAts` | `true` | Probe ATS platforms for the companies you named |
| `useGeneralBoards` | `false` | Also scrape LinkedIn and Wellfound |
| `collectorConcurrency` | `4` | How many sources are read at once |
| `interRequestDelayMs` | `0` | Delay between requests to the same rate-limited host |
| `requestTimeoutMs` | `20000` | Per-request timeout |
| `requestRetries` | `2` | Retries for a rate-limited or failing source |
| `perSourceConcurrency` | `6` | Concurrency for per-posting detail fetches |

**Interview & Negotiation Prep** - the timing of its two AI calls:

| Setting | Default | What it does |
| --- | --- | --- |
| `skillBudgetMs` | `44000` | Total time the skill may take before it returns partial guidance |
| `delegatedTimeoutMs` | `24000` | How long it waits for the delegated prep call |
| `brainFallbackTimeoutMs` | `19000` | How long it waits for its direct model call |
| `brainEndpoint` | `BRAIN_URL` | Override the model service address for this skill only |

Leave these alone unless interview prep is timing out. If you do raise `skillBudgetMs`, keep it well
under 60000, because the web proxy in front of Stage7 cuts off requests at 60 seconds.

### Pinning specific company job boards

By default the search works from company names: you say "Stripe" and Stage7 probes the known ATS
platforms to find that company's board. That is usually enough, and it needs no key.

Some employers post through a board whose name does not match the company name. When a search tells you
it could not find a board for a company you know is hiring, pin it. In **Skill Settings**, under **Job
Search & Fit Ranking**, set `boardTokens`:

```json
{
  "greenhouse": ["stripe"],
  "ashby": ["ashby"],
  "lever": ["leverdemo"]
}
```

Each key is a platform and each value is a list of exact board names to read. You can find the right
name on the company's careers page URL.

### Tracking specific companies with portals.json

If you want a standing list of companies to sweep on every run, you can add a `portals.json` file in
your `CAREER_HOME` folder. It is optional. With no such file, Stage7 uses built-in defaults and needs
nothing from you.

```json
{
  "tracked_companies": [
    {
      "name": "Acme",
      "company": "Acme",
      "provider": "greenhouse",
      "token": "acme",
      "careers_url": "https://acme.example/careers",
      "enabled": true
    }
  ],
  "job_boards": []
}
```

| Field | Meaning |
| --- | --- |
| `token` | The exact board name, the same string you would put in `boardTokens` |
| `provider` | `greenhouse`, `ashby`, `lever`, `workday`, `icims`, `smartrecruiters`, `bamboohr`, `breezy`, `jobvite`, `successfactors`, `oracle`, `recruitee`, `teamtailor`, `workable`, or `phenom` |
| `enabled` | Set to `false` to skip this company without deleting the entry |
| `max_pages` | Optional page cap for paginating boards |

### Widening the search

**Public remote-job feeds** are on by default and need no company name. They cover roles that are
remote-first, which is why a search with no companies at all still returns real listings.

**LinkedIn and Wellfound** are off by default, and this is deliberate. From a datacenter IP both are
mostly blocked, so turning them on adds a permanent failure to every single run without adding much.
Only enable `useGeneralBoards` if your search genuinely needs them.

The best way to reach smaller employers is not a new source. It is **company names**. Add the specific
companies you want to your profile's target companies, and the search will probe each one's own board.

### Scheduling an automatic search

If you want Stage7 to look for new roles on its own, use a watch.

1. In the Career Coach workspace **Overview**, find **Job Discovery & Fit Ranking**.
2. Press **Create Watch**, or **Create & Run Now** to do the first run immediately.
3. Choose a cadence: Daily, Hourly, or Weekly.

The same controls appear for **Job Discovery** in the Tools page. A watch keeps the ranked list fresh
without you opening anything.

### Running a skill directly from the command line

Occasionally you will want to script a skill rather than click it. Skills are reachable over HTTP, and
there is one rule: a skill execution must carry assistant context, or the request is rejected.

```bash
curl -X POST http://localhost:3900/api/tool-executor/tools/career-job-discovery-fit-ranking/execute \
  -H 'Content-Type: application/json' \
  -H 'X-Assistant-Id: career' \
  -d '{
    "input": {
      "jobTitles": ["Senior Data Analyst"],
      "companies": ["Stripe", "Datadog"],
      "locations": ["remote"],
      "dryRun": true
    }
  }'
```

| Header or field | Why it matters |
| --- | --- |
| `X-Assistant-Id: career` | Required. Without it a skill run is refused with a validation error |
| `input.dryRun` | `true` previews an action instead of taking it. Keep it `true` until you trust the output |

Skills that act on your behalf are also gated by risk tier. The three application and outreach skills
return HTTP 403 with a confirmation-required error unless you pass an explicit confirmation, and return
HTTP 428 if credentials a skill needs are missing. This is a safety feature working correctly, not a
fault.

---

## Part 3: Use the skills

### How the skills fit together

The workspace **Overview** tab lists ten skills in the order you would actually use them. Each one is a
panel with an input form, a Run button, and a result card. You never need to memorise an order - the
panel order already is the workflow.

The skills are not independent. Most of them build on what an earlier one saved:

- **Profile Intake** saves your details, and the search and ranking skills read them.
- **Job Search & Fit Ranking** saves a ranked shortlist, and the apply, prep, and tracking skills read
  the roles from it.
- **Resume & Template Manager** saves your documents, and the apply skills read the templates from it.
- **Pipeline & Outcome Tracker** saves your application history, and the apply skills fall back to it.

That is why the same fields keep appearing as dropdowns in later skills: they are populated from your
saved data.

### The skill panel at a glance

| # | Skill | Run button | What it produces |
| --- | --- | --- | --- |
| 1 | Resume & Market Positioning Advisor | Evaluate positioning | Resume edits and a realistic target salary range |
| 2 | Resume & Template Manager | Manage templates | Saved resume and cover letter templates |
| 3 | Job Search & Fit Ranking | Search & Rank | A ranked, clickable shortlist of real roles |
| 4 | Apply to Selected Jobs | Apply to selected jobs | Applications submitted or staged |
| 5 | Application & Outreach Manager | Prepare outreach & applications | Tailored materials and a drafted message, staged |
| 6 | Application + Recruiter Outreach | Draft outreach follow-up | A recruiter follow-up draft |
| 7 | Pipeline & Outcome Tracker | Show pipeline & record outcome | Your live pipeline and stale follow-ups |
| 8 | Interview Practice & Mock Interviewer | Start mock interview | A practice session and coaching notes |
| 9 | Interview & Negotiation Prep | Create interview briefing | A question briefing and a negotiation script |
| 10 | Upskill & Learning Planner | Generate upskill plan | Missing skills and a learning plan |

### Stage 1: Your profile

#### Resume & Template Manager

**What it does:** Stores your resume and cover letters so they can be reused for every application, and
detects the `{{variable}}` placeholders you can fill per role.

**What you give it:** Your resume as pasted text, or a file upload (PDF, DOCX, MD, or TXT). Optionally a
name, a type of `resume` or `cover-letter`, and tags.

**What you get:** Saved templates with an ID, a version number, and any variables detected. These fill
the template pickers in the apply skills.

**How it decides what you asked for:** There is no mode dropdown. The skill infers the action from the
fields you filled in:

| You filled in | It does |
| --- | --- |
| Nothing, or only a type filter | Lists your templates |
| An ID | Shows that one template |
| A name, content, file, or tags | Saves a template |
| A `delete` flag alongside an ID | Deletes that template |

**Tip:** Give your default resume the name you will recognise later. When you have three tailored
versions, the picker becomes the only thing standing between you and sending the wrong one.

#### Resume & Market Positioning Advisor

**What it does:** Compares your resume against the roles already found for you, suggests specific
edits, and gives you a realistic target salary range for your seniority.

**What you give it:** Usually nothing. It reads your saved profile and your saved shortlist. If you have
neither, you can paste resume text and a market list directly.

**What you get:** Market signals, a target compensation range, and a short list of concrete resume
improvements drawn from a keyword list of roughly ninety terms.

**Tip:** Run this after a search, not before. Comparing yourself against real postings is far more
useful than comparing yourself against nothing.

### Stage 2: Finding and ranking roles

#### Job Search & Fit Ranking

**What it does:** The main way you find work. It searches real job boards, scores each role against
your profile, checks your resume against the posting's screening requirements, and ranks everything
best fit first.

**What you give it:**

| Field | Default | Notes |
| --- | --- | --- |
| `jobTitles` | From your profile | Otherwise nothing to match against |
| `companies` | From your profile | Probed against every known ATS platform |
| `locations` | From your profile | Include `remote` to keep remote roles only |
| `minSalary` / `maxSalary` | From your profile | Filters and scores |
| `maxPerBoard` | `50` | Configured in Skill Settings, not here |
| `minRoleScore` | `0.01` | Set to `0` to also see off-target listings |
| `autoApplyThreshold` | unset | **Read this one carefully.** If you set it, every role scoring at or above that fit score is handed to the apply skill automatically. Leave it unset until you trust the ranking |
| `dryRun` | `true` | Previews those auto-applications instead of submitting |

**What you get:** A ranked shortlist, each role with a score out of 100, the reasons behind it, and a
direct link to the posting. A per-board report tells you exactly which sources were searched and how
many roles each returned.

**Where it searches, and what each source needs:**

| Source | Key needed | Coverage |
| --- | --- | --- |
| Greenhouse | No | Every company posting via Greenhouse |
| Ashby | No | Every company posting via Ashby |
| Lever | No | Every company posting via Lever |
| RemoteOK, Remotive, Arbeitnow, Jobicy, We Work Remotely, Himalayas | No | Remote-first and public aggregators |
| Workday, iCIMS, SmartRecruiters, BambooHR, Breezy, Jobvite, SuccessFactors, Oracle, Recruitee, Teamtailor, Workable, Phenom | No | Probed for the companies you name |

**Safety:** `dryRun` is `true` by default, and the apply skills ask for confirmation before anything is
submitted.

#### The tools behind the search

Two tools do the actual work. You do not normally run them yourself - the skill calls them - but they
are on the **Tools** page if you want to run one directly.

- **Job Discovery** reads the boards, removes duplicate postings of the same role, and applies your
  location and salary filters. Its result is a clean list with title, company, location, remote flag,
  published pay, the full description, and an apply link.
- **Rank Opportunities** scores a list of roles out of 100 against your profile across five weighted
  factors - role match (0.45), keyword match (0.20), salary (0.15), location (0.10), and company (0.10) -
  and returns a breakdown and a sentence of justification for each. Roles at companies you excluded are
  dropped entirely.

**Tip:** Those five weights are the most personalisable thing in the assistant. Override any of them by
passing `weights`, and Stage7 rebalances the rest so they still sum to 1. If you care far more about pay
than location, raise `salary` and lower `location`.

### Stage 3: Applying

#### Apply to Selected Jobs

**What it does:** Submits your application to one role or a batch, using the application details attached
to each posting.

**What you give it:** The roles to apply to (a picker fed from your search results), whether to preview
or submit, and optionally a specific saved resume template or cover letter template for this batch only.

**What you get:** Per-role results with anything that could not be matched, plus a tracking record you
can see later in the pipeline.

**Safety:** This is a `represent` tier skill. It asks you to confirm before anything is really submitted,
and `dryRun` defaults to `true`.

**Tip:** Leave the template pickers alone for your first batch. Using your default documents tells you
whether the pipeline works at all before you complicate it.

#### Application & Outreach Manager

**What it does:** The all-in-one path. It tailors your resume and cover letter per role, drafts the
recruiter message, and stages everything for review.

**What you give it:** Target roles, the company, the person if you have one, how you know them, and the
channel.

**What you get:** Tailored materials, a drafted message, and a record of what was prepared.

**Safety:** Stages by default and sends nothing. Read everything it produces.

#### Application + Recruiter Outreach

**What it does:** The follow-up loop. It prepares the application, then drafts the message to the hiring
contact once it has gone out.

**What you give it:** Company, contact person, your relationship stage (`cold_outreach`, `follow_up`,
`thank_you`, or `referral_ask`), and channel (`email` or `linkedin`).

**What you get:** An application and a matching follow-up draft, so nothing gets forgotten.

**Safety:** Confirmation required before sending. It also accepts a connected send tool if you have one,
which is what turns a draft into a real send.

### Stage 4: Interview preparation

#### Interview & Negotiation Prep

**What it does:** Builds a briefing of the questions you are likely to be asked at a specific company,
plus a compensation negotiation script.

**What you give it:** The company and the role. The stronger your input, the better the output - paste
the actual job description if you have it.

**What you get:** A question-and-answer briefing on that company and a negotiation guide covering what to
say and how to say it when money comes up.

**Note:** This is the slowest skill. It makes two AI calls in parallel, and each one falls back to a
direct model call if the first is slow. Give it a minute.

#### Interview Practice & Mock Interviewer

**What it does:** Puts you through a realistic practice interview and tells you where you did well and
where to improve.

**What you give it:** The role, the company, and the stage: `phone_screen`, `technical`, `onsite`, or
`final`.

**What you get:** A practice session with a session ID, and coaching notes. If the AI prep service is
unreachable, it still returns a topic checklist to review rather than an error.

**Tip:** Run the same round twice. The second run is noticeably sharper than the first, and the
difference is the feedback working.

#### Upskill & Learning Planner

**What it does:** Works out what is standing between you and a role you do not quite qualify for, then
builds a plan to close the gap.

**What you give it:** A job title, or a pasted job posting, plus the skills you already have. It
requires at least the title or the posting, and reports `blocked` if you give it neither.

**What you get:** The specific skills you are missing and a learning plan. Missing skills are detected by
checking which of your listed skills never appear in the posting text.

**Tip:** Paste a real posting. It then tells you exactly which terms that employer used, which is far
more useful than a generic course list.

### Stage 5: Keeping track

#### Pipeline & Outcome Tracker

**What it does:** Shows every application you have in flight, lists the ones that have gone quiet, and
records what came back.

**What you give it:** The role, and what happened: `applied`, `interviewing`, `offer`, `rejected`,
`withdrawn`, `accepted`, or `no-response`. Optionally feedback, the date applied, and offer details.

**What you get:** A live view of the whole search, plus a stale follow-up list. With no role given, it
lists up to your last 20 applications. With a role given and no pipeline yet, it stores a new entry
from what you typed.

**Tip:** Record outcomes as they arrive, including rejections. The response rate is how you spot a
problem early - such as applying in a way that is not landing.

#### The tools behind the tracker

- **Pipeline Report** takes no input and returns the summary: totals, how applications are distributed
  across stages, and what has gone quiet.
- **Track Outcomes** files one result and updates your running statistics and response rate.

### Reading the status a skill returns

Skills return a **status** alongside their output. Reading it saves a lot of confusion.

| Status | What it means | What to do |
| --- | --- | --- |
| `ok` | Completed cleanly | Nothing |
| `partial` | Some job sources could not be reached, so the result is incomplete | Read the per-board report; retry later or try fewer companies |
| `no-match` | Every source answered and genuinely had nothing matching | Your filters are too tight. Widen salary, drop the location filter, or clear search terms |
| `no-match` on positions | Positioning had no market to compare against | Run a search first |
| `blocked` | A required input was missing | Fill in the field the message names |
| `not-connected` | A dependency was unavailable, usually the model service | Check your model setup in [Step 4](#step-4-connect-an-ai-model) |
| `dry-run` | Prepared and staged, nothing was sent | Read it, then switch `dryRun` off when you are ready |
| `confirmation-required` | An action needs your explicit approval | Approve it if you meant to |
| `failed` | The run could not complete | Read the error text; it names what could not be retrieved |

A `partial` result is honest rather than broken. Stage7 tells you which sources answered and which did
not, so you always know whether you are looking at the whole market or part of it.

---

## Part 4: A sensible order to work in

Each step feeds the next, so working in order saves a lot of back-and-forth.

1. **Save your profile.** Five minutes now saves hours later.
2. **Make your data permanent.** The one-time fix in
   [Keep your job search data permanently](#keep-your-job-search-data-permanently).
3. **Save your resume template.** So applications have something to use.
4. **Find some roles.** Job Search & Fit Ranking. Give it a handful of company names you would be happy
   to work for, or just run it and use the roles from your saved profile.
5. **See where you stand.** Resume & Market Positioning Advisor.
6. **Prepare applications.** Application & Outreach Manager. Read everything it drafts.
7. **Apply for real.** Switch out of preview mode when you are happy with the materials.
8. **Get ready for interviews.** Interview & Negotiation Prep, then as many practice rounds as you want.
9. **Track everything.** Record each outcome as it arrives.
10. **Follow up.** The outreach skills keep the conversations moving.
11. **Close the gaps.** Upskill & Learning Planner for the roles you nearly qualified for.
12. **Schedule it.** Set a Daily or Weekly watch on Job Discovery so the list stays fresh.

Add companies to your profile and run the search again whenever your target list changes. Running it
regularly is the point - new roles appear constantly, and a search only reflects what is posted today.

## Everyday commands

Run these from your project folder.

| What you want to do | Mac or Linux | Windows |
| --- | --- | --- |
| First-time setup | `./setup.sh` | Double-click `setup.bat` |
| Start again after a restart | `docker compose up -d` | `docker compose up -d` |
| Shut it down | `docker compose down` | `docker compose down` |
| Full setup after changing `.env` | `./setup.sh` | Double-click `setup.bat` |
| Quick rebuild, no reinstall | `./buildone.sh` | Double-click `buildone.bat` |
| Check what is running | `docker compose ps` | `docker compose ps` |
| Confirm the Career Coach loaded | `curl http://localhost:3900/api/workers/assistants/career` | Same |
| List every registered skill | `curl http://localhost:3900/api/tool-executor/tools` | Same |
| Check the assistant manifest | `npm run adk:validate -- career` | Same |

`setup` does the complete job: it checks Docker, sets up your settings file, rebuilds, and starts
everything. Reach for it first whenever something seems wrong. `buildone` is the faster option for a
routine rebuild.

## If something goes wrong

**The web page will not load.** Wait a minute and refresh. If it still fails, run `docker compose ps` and
confirm Docker is running.

**The Career Coach is not in the Assistants list.** Check that `.env` contains `STAGE7_ASSISTANTS=career`,
then run the setup script again. A plain `docker compose up -d` will not apply the change, because the
assistant list is fixed at build time.

**A skill says something is "not connected".** This is Stage7 telling you it is missing something it
needs, not a crash. The usual causes are:

- No AI model is reachable. Check [Step 4](#step-4-connect-an-ai-model).
- Your profile is empty. Run **Save profile**.
- No roles have been found yet. Run **Search & Rank** first.

**Interview prep returns nothing and says to set `brainEndpoint`.** The skill could not reach the model
service. Check that `BRAIN_URL` in `.env` points at a service that is actually running, and that
`docker compose ps` shows it up.

**Job searches come back empty.** Look at the per-board report in the result first. It tells you which
sources were searched and what each returned. Then:

- **"no board with that name."** The company posts somewhere else. Check their careers page for the
  exact board name and pin it in `boardTokens` or `portals.json`.
- **Everything says "unavailable".** Check your internet connection, then try fewer companies.
- **The boards worked but nothing matched.** Your filters are too tight. Widen the salary range, drop
  the location filter, or clear your search terms.
- **The status is `partial`.** Some sources were unreachable. The results you have are real, but they
  are not the whole market.

**A search only finds roles at big companies.** The built-in sources cover employers who post through
the major applicant tracking systems, which is most but not all. Add specific company names to your
profile for the ones you care about - that reaches a company's own board whatever platform they use.

**An application says the job listing was not found.** That role is not in your saved list. Run
**Search & Rank**, then apply to roles from the list it returns.

**A role picker in a later skill is empty.** Dropdowns are fed from your saved data. Run **Search & Rank**
first for role pickers, and **Manage templates** first for template pickers.

**My profile or saved roles disappeared after a rebuild.** Expected until you do
[Keep your job search data permanently](#keep-your-job-search-data-permanently).

**A setting I changed has no effect.** Check which of the three places you changed it in, using
[Where configuration lives](#where-configuration-lives). In particular, the `CAREER_*` timeout
variables in `.env` are not read by anything - see
[Environment variables that look like they matter but do not](#environment-variables-that-look-like-they-matter-but-do-not).

**The local model feels too slow.** Normal on a modest computer, and it mostly affects the practice
interview and preparation skills. A smaller model runs faster, and the cloud option in
[Step 4](#step-4-connect-an-ai-model) is a one-line change.

**Nothing works and you are not sure why.** Run the setup script again. It rebuilds everything from
scratch and re-applies your settings. A few minutes, and it resolves most one-off problems.

## Safety and privacy

- **Nothing is sent without your confirmation.** The three application and outreach skills are
  confirmation-gated, and preview mode is on by default. Switch it off only when you trust the output.
- **Your career data is yours.** Stage7 will not invent employers, salaries, or listings to fill a gap.
  If it does not know something, it says so.
- **Never paste a password, API key, or private key into a chat.** Store credentials in Stage7's Vault.
  The Career Coach will not ask you for one.
- **There is no email or Notion sync.** Those capabilities are not part of this assistant. If any prompt
  ever asks you for a mailbox password or an API token, close it.
- **Your resume and profile stay on your machine**, in `CAREER_HOME`, unless you point that folder
  somewhere networked yourself.
- **It is a coach, not a lawyer.** For contract questions, disputes, or anything legally binding, talk
  to a real professional.

## Where your data lives

Everything the Career Coach saves is a JSON file in your `CAREER_HOME` folder. Nothing is hidden in a
database you cannot read.

| File | Written by | Holds |
| --- | --- | --- |
| `profilePath/default.json` | Profile Intake | Your details, targets, preferences, resume text |
| `templates.json` | Resume & Template Manager | Your saved resumes and cover letters |
| `listPath.json` | Job Search & Fit Ranking | Your ranked shortlist and the per-board report |
| `listings/default.json` | Job Discovery | Raw discovered postings |
| `rankPath.json` | Rank Opportunities | Scores and dropped-off-target listings |
| `applications/tracking.json` | Apply and Track skills | Every application and its status |
| `portals.json` | You, by hand | Your standing company list, if you use one |

To back up your whole search, copy the `CAREER_HOME` folder. To move to a new machine, copy it across.

## Glossary

| Word | Meaning |
| --- | --- |
| Skill | A thing you can run from the Overview tab. Ten of them |
| Tool | A building block a Skill calls. Ten of them, hidden from the panel |
| Tier | The risk level of a Skill. `advise` and `aid` run freely; `represent` needs confirmation |
| Dry run / preview | Prepare the work, take no real action |
| ATS | The applicant tracking system a company posts jobs through |
| Fit score | How well a role matches your profile, out of 100 |
| Board token | The exact internal name of a company's job board |
| Profile ID | Which saved profile to use. Almost always `default` |
