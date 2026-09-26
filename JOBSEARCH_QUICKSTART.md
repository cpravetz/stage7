# Job Search Quickstart

A step-by-step guide to setting up Stage7 with **only the Career Coach** enabled and running on free AI
models.

By the end you will have a job search assistant that knows your background, finds and ranks roles,
prepares your applications, runs your interview practice, and keeps track of where everything stands.

- **Time needed:** about 20 minutes to set up, plus a few minutes per job
- **Cost:** free, if you follow the free-model steps in [Step 4](#step-4-connect-a-free-ai-model)
- **Works on:** Windows, Mac, and Linux

## What you need first

- A computer with **Docker Desktop** installed (Windows and Mac) or **Docker Engine** (Linux)
- About 8 GB of free memory
- A free account with an AI model provider, or the free Ollama app installed locally

Everything else is built in.

## Table of Contents

- [Step 1: Install Docker](#step-1-install-docker)
- [Step 2: Get the Stage7 files](#step-2-get-the-stage7-files)
- [Step 3: Choose the Career Coach only](#step-3-choose-the-career-coach-only)
- [Step 4: Connect a free AI model](#step-4-connect-a-free-ai-model)
- [Step 4b: Search LinkedIn, Indeed, and Google Jobs (optional)](#step-4b-search-linkedin-indeed-and-google-jobs-optional)
- [Step 5: Run the setup](#step-5-run-the-setup)
- [Step 6: Open Stage7 and create your account](#step-6-open-stage7-and-create-your-account)
- [Step 7: Tell Stage7 to prefer free models](#step-7-tell-stage7-to-prefer-free-models)
- [Step 8: Fill in your job search details](#step-8-fill-in-your-job-search-details)
- [What Each Skill Does For You](#what-each-skill-does-for-you)
- [A Sensible Order To Work In](#a-sensible-order-to-work-in)
- [Everyday Commands](#everyday-commands)
- [If Something Goes Wrong](#if-something-goes-wrong)
- [Making Your Job Search Permanent](#making-your-job-search-permanent)
- [A Few Safety Notes](#a-few-safety-notes)

---

## Step 1: Install Docker

Docker is the software that runs Stage7 for you. You install it once.

1. Go to <https://docs.docker.com/get-docker/>.
2. Download and install Docker Desktop for your operating system.
3. Start Docker Desktop and wait until it says it is running. On Linux, start the Docker service.

That is the only prerequisite. Stage7 needs no other software, database, or coding tools.

## Step 2: Get the Stage7 files

1. Download or clone the Stage7 project to a folder on your computer, for example `stage7`.
2. Open that folder. Everything in the next steps happens there.

If you use the command line, this looks like:

```bash
git clone https://github.com/cpravetz/stage7.git
cd stage7
```

## Step 3: Choose the Career Coach only

Out of the box Stage7 loads a large catalog of assistants. You only want the Career Coach, so you tell
Stage7 to load that one.

Stage7 keeps its settings in a plain text file called `.env` in your project folder. If it does not exist
yet, make a copy of the sample file:

| Your system | Command |
| --- | --- |
| Windows | `copy .env.example .env` |
| Mac or Linux | `cp .env.example .env` |

Now open `.env` in any text editor (Notepad, TextEdit, VS Code - whatever you have) and find this line:

```dotenv
STAGE7_ASSISTANTS=
```

Change it so it reads:

```dotenv
STAGE7_ASSISTANTS=career
```

That single word, `career`, is what loads the Career Coach and nothing else.

Leave every other line alone for now. You will come back to this file in the next step.

## Step 4: Connect a free AI model

The Career Coach uses an AI model to write your answers, draft your messages, and run your mock
interviews. You need to point it at a model. All of the options below are free.

### Option A: Run models on your own computer (fully free, no account)

This is the best option if you want nothing to leave your machine.

1. Download and install **Ollama** from <https://ollama.com/download>.
2. Open a terminal and run `ollama pull llama3.2` to download a model. You only need to do this once.
3. In your `.env` file, find the Ollama setting and change it to this value:
   `OLLAMA_API_BASE=http://host.docker.internal:11434`
4. Save the file.

That is it. The model stays on your computer and costs nothing to use.

### Option B: Use a free cloud account (no download, works anywhere)

If you would rather not install anything, pick one of these. Both have free tiers and both work with the
Career Coach. Create a free account, copy your key, and paste it into `.env`.

**OpenRouter** - one account, many models, generous free tier.

```dotenv
OPENROUTER_API_KEY=paste-your-key-here
```

**Hugging Face** - a free token, free open models.

```dotenv
HUGGINGFACE_API_KEY=paste-your-token-here
```

### Which should I pick?

| If you want... | Use |
| --- | --- |
| Nothing sent to the internet, zero cost forever | Option A (Ollama) |
| No extra software, works immediately | Option B (OpenRouter) |

A practical combination is Ollama as your everyday model, plus one free cloud account as a backup.

### Keep it free

If you follow Option A or B and leave all the other provider lines in `.env` empty, you will never be
charged. Stage7 only uses a provider if you have given it a key, so a blank line means that provider is
switched off.

## Step 4b: Search LinkedIn, Indeed, and Google Jobs (optional)

Job searching already works with no configuration - Greenhouse, Ashby and Lever are searched
automatically and need no key. This step is optional and adds the big job boards.

LinkedIn, Indeed and Glassdoor do not let anyone read their listings automatically, so Stage7 will not try
to scrape them. Instead, one SerpAPI key gives access to a search service that returns those same
listings properly - and its Google Jobs feed already carries the LinkedIn, Indeed and Glassdoor postings,
so one key covers all of them.

1. Create a free account at <https://serpapi.com>.
2. Copy your API key from the dashboard.
3. Open your `.env` file and add this line:

   ```dotenv
   SERPAPI_API_KEY=paste-your-key-here
   ```

4. Run setup again so the change takes effect.

You now also get **Monster** and **Wellfound** (good for startup and remote roles).

The free tier includes a monthly allowance of searches, which is enough for a focused job search. If you
skip this step, nothing else breaks - the other three sources keep working and the per-board report will
show that the aggregators were skipped and why.

## Step 5: Run the setup

This is the step that installs and starts everything. It takes a few minutes while Stage7 builds itself.

**Windows** - the easy way, no typing required:

1. Double-click **`setup.bat`** in your project folder.
2. A window opens. Press a key each time it asks you to continue.
3. When it asks which assistants to load, type `career` and press Enter.
4. Leave the window open until it says the setup is complete.

**Windows** - if you prefer to run it from a terminal:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

**Mac or Linux** - from a terminal in your project folder:

```bash
./setup.sh
```

Whichever route you take, the script asks which assistants to load. Type `career` when it does. If you
already edited `.env` as described in [Step 3](#step-3-choose-the-career-coach-only), the script picks up
your setting and skips that question.

When it finishes you should see a success message. The first run is the slowest because it builds
everything from scratch. Later starts take seconds.

## Step 6: Open Stage7 and create your account

1. Open your web browser and go to <http://localhost:8080>.
2. Create your account using the registration form.
3. Sign in.
4. Choose the **Career Coach** as your assistant.

If the page does not load, wait a minute and refresh. Stage7 may still be starting up.

## Step 7: Tell Stage7 to prefer free models

One more click in the app, and you are guaranteed to stay on free models as much as possible.

1. In Stage7, open **Settings** from the left-hand menu.
2. Tick the box next to **Prefer Free / Self-hosted Models**.
3. Click **Save Preferences**.

Worth knowing: this is a strong preference, not a hard block. If a request genuinely cannot be handled by
a free model, Stage7 will use a paid one - but only if you have set a paid key up. If you left all the
paid keys blank, there is nothing to fall back to and you are safe by default.

## Step 8: Fill in your job search details

Before the skills can do anything useful, Stage7 needs to know who you are and what you are looking for.
This takes about five minutes and makes every other skill noticeably better.

1. Open your Career Coach workspace.
2. Find the **Profile Intake** skill and run it.
3. Fill in what you know:

| What to give it | Why it matters |
| --- | --- |
| Your target job titles | Decides which roles get ranked highly |
| Salary floor and ceiling | Filters and scores out roles that pay wrong |
| Preferred locations and remote/onsite | Filters by what you actually want |
| Target companies | Boosts the ones you want to work for |
| Companies to avoid | Removes them from your results entirely |
| Key skills and keywords | Improves matching and your resume score |
| Your current resume text | Used by the resume and positioning skills |

You do not need all of it to be perfect. Start with the essentials and add the rest later - running Profile
Intake again updates your details without wiping what is already there.

While you are in the workspace, also open the **Tools** tab. Under **Job Discovery & Fit Ranking** you
can pin the exact company job boards to search if you want to be specific about where your shortlist comes
from. Leaving it alone is fine - giving the skill company names works just as well, and it finds their
boards on its own.

One more thing worth doing now, before you spend time filling things in: your profile and saved roles are
kept in a temporary location by default, and a rebuild will clear them. There is a one-time fix in
[Making Your Job Search Permanent](#making-your-job-search-permanent) that takes a couple of minutes.

---

## What Each Skill Does For You

The Career Coach has 20 skills working together across six stages of a job search. The sections below
explain each one in plain terms: what it does, what you give it, and what you get back.

### Stage 1: Your profile

#### Profile Intake

**What it does:** Saves the details of who you are and what you want, so the other skills have something to
work from.

**What you give it:** Your details, target roles, salary range, locations, skills, resume text.

**What you get:** A saved profile that every other skill reads. This is the foundation - the skills that
follow are much weaker without it.

**Tip:** Come back and update it as your search evolves. Adding a new target company takes seconds.

#### Resume & Template Manager

**What it does:** Stores your resume and cover letter so they can be reused for every application, and
checks them for the formatting that applicant tracking systems like to filter out.

**What you give it:** Your resume text, or a resume file to upload.

**What you get:** A reusable, saved set of templates you never have to paste in again.

#### Resume & Market Positioning Advisor

**What it does:** Compares you against the roles you are targeting and tells you how you actually stack
up, then suggests specific resume edits and a realistic salary range to aim for.

**What you give it:** Nothing much. It reads your saved profile and the roles already found for you.

**What you get:** A clear read on your market position and a short list of concrete improvements.

**Tip:** Run this after you have found some roles. It is far more useful with real roles to compare
against than without them.

### Stage 2: Finding and ranking roles

#### Job Discovery & Fit Ranking

**What it does:** The main way you find work. It searches real job boards, scores how well each role fits
your profile, checks your resume against each job's screening requirements, and ranks everything from best
fit to worst.

**What you give it:** Company names and/or job titles, plus locations and any salary limits. It also
falls back to your saved profile, so once Profile Intake is filled in you can often just press run. An
optional "auto-apply" setting can hand your top matches straight to the application skill.

**What you get:** A ranked shortlist of roles, best fit first, with the reasons behind each score, plus a
per-board report so you can see exactly which sources were searched and how many roles each returned.

##### Where it searches

| Source | Needs a key? | Coverage |
| --- | --- | --- |
| **Greenhouse** | No | Every company that posts via Greenhouse |
| **Ashby** | No | Every company that posts via Ashby |
| **Lever** | No | Every company that posts via Lever |
| **Google Jobs** | SerpAPI key | Aggregates listings from LinkedIn, Indeed, Glassdoor, ZipRecruiter and company career sites |
| **LinkedIn** | SerpAPI key | LinkedIn's own listings |
| **Indeed** | SerpAPI key | Indeed's own listings |
| **Glassdoor** | SerpAPI key | Glassdoor's own listings |
| **Monster** | SerpAPI key | Monster's own listings |
| **Wellfound** | SerpAPI key | Startup and remote roles |

**The first three need no key, no account, and no configuration.** Most medium and large employers post
their openings through one of those three, so a stock install already returns real, current listings. Give
the skill a few company names and it will find their boards automatically.

**To add the big job boards**, add a free SerpAPI key - see [Step 4b](#step-4b-search-linkedin-indeed-and-google-jobs-optional).
One key covers all six remaining sources at once. The free tier includes a monthly allowance of searches,
which is plenty for a focused search.

Stage7 deliberately does not scrape LinkedIn, Indeed or Glassdoor directly. Those sites block automated
access and it breaks their terms of service, so a scraper would work for a while and then quietly fail.
SerpAPI returns the same listings legitimately, and its Google Jobs feed already carries the LinkedIn,
Indeed and Glassdoor postings.

#### Job Discovery

**What it does:** The search step underneath the skill above. It reads the job boards, removes duplicate
listings of the same role, and applies your location and salary filters.

**What you give it:** Company names, job titles, locations, and salary limits.

**What you get:** A clean list of roles, each with title, company, location, whether it is remote, pay where
published, the full job description, and a direct link to apply.

#### Rank Opportunities

**What it does:** Scores your roles against your profile on what actually matters to you - how close the
title is to what you want, whether the pay fits, whether you would enjoy the company, whether the
location works, and how well your skills match.

**What you give it:** A list of roles to score, and optionally your own priorities if the defaults do not
suit you.

**What you get:** Every role scored out of 100, with a breakdown of each factor and a sentence explaining
why it landed where it did. Roles at companies you excluded are dropped entirely.

**Tip:** If the default priorities do not match how you think, adjust the weights. For example, if you
care far more about pay than location, weight pay higher. It is the most personalisable skill in the set.

### Stage 3: Applying

#### Application & Outreach Manager

**What it does:** The all-in-one application path. It tailors your resume and cover letter to each role,
drafts the message to the recruiter, and stages everything for you to read and approve before anything is
sent.

**What you give it:** Which roles to target, who to contact, and how well you know them (cold contact,
warm contact, or asking for a referral).

**What you get:** Tailored application materials, a drafted message, and a full record of what was
prepared.

**Safety:** This runs in practice mode by default, which means it prepares everything and sends nothing.
You stay in control of every message that goes out.

#### Multi-Portal Application Orchestrator

**What it does:** Sends your application to a chosen role, or to several at once, using the application
details attached to each job posting.

**What you give it:** Which roles to apply to, plus any last-minute changes - a specific resume or cover
letter for one particular role, without disturbing your defaults for the rest.

**What you get:** Applications submitted, or staged if you left them in practice mode, and a record of each
one.

**Safety:** It always asks you to confirm before anything is actually submitted.

#### Apply to Jobs

**What it does:** The submission step underneath the two skills above. It works through your applications,
records each one, and keeps track of what went out and what did not.

**What you give it:** Which roles to apply to, which resume and cover letter to use, and whether to
practise or submit for real.

**What you get:** A list of applications with their status, and any that could not be matched so you know
to follow up manually.

#### Networking Outreach

**What it does:** Writes the message you send to a recruiter, tailored to how you know them and how you
got in touch.

**What you give it:** The company, who you are contacting, how you know them, and whether this is an email
or a LinkedIn message.

**What you get:** A ready-to-send message with a subject line, in the right tone for the situation -
whether it is a first approach, a polite follow-up, a thank you, or a referral request.

**Tip:** Read the draft before sending. A message in your own voice lands better than a polished one that
does not sound like you.

### Stage 4: Interview preparation

#### Interview & Negotiation Prep

**What it does:** Prepares you for a specific company. It builds a briefing of the questions you are likely
to be asked, and a script for negotiating salary.

**What you give it:** The company and the role.

**What you get:** A question-and-answer briefing on that company, plus what to say and how to say it when
money comes up.

**Tip:** The stronger your input, the better the output. Give it the actual job description if you have it.

#### Interview Practice & Mock Interviewer

**What it does:** Puts you through a realistic practice interview and then tells you where you did well
and where to improve.

**What you give it:** The role, the company, and which stage of interviews you are preparing for - a
phone screen, a technical round, an on-site day, or a final round.

**What you get:** A practice session, performance notes, and specific things to work on.

**Tip:** The more rounds you run, the more useful the feedback becomes. Most people find a second run at
the same question noticeably sharper than the first.

#### Upskill & Learning Planner

**What it does:** Works out what is standing between you and a role you want but do not quite qualify for
yet, then builds a learning plan to close the gap.

**What you give it:** A job title, or a full job posting, plus the skills you already have.

**What you get:** The specific skills you are missing and a plan for getting them.

**Tip:** Paste in a real job posting. It tells you exactly which skills that employer is looking for,
which is far more useful than a generic course list.

### Stage 5: Keeping track

#### Pipeline & Outcome Tracker

**What it does:** Shows you every application you have in flight, and records what came back.

**What you give it:** The role, and what happened - interview, offer, rejection, or no reply.

**What you get:** A live view of your whole search, plus a list of applications that have gone quiet and
need a follow-up.

**Tip:** Record outcomes as they arrive, even the rejections. The response-rate figures are how you spot a
problem early, such as applying in a way that is not landing.

#### Pipeline Report

**What it does:** Pulls together everything you have applied to into one summary - totals, how things are
distributed across stages, and what has gone quiet.

**What you give it:** Nothing.

**What you get:** A snapshot of your search at a glance.

#### Track Outcomes

**What it does:** Files the result of an application and updates your running totals.

**What you give it:** The role, the outcome, any feedback you received, and offer details if you got one.

**What you get:** An accurate history, updated statistics on your search, and a running response rate.

### Stage 6: Following up and closing loops

#### Application & Recruiter Outreach

**What it does:** The complete recruiter loop in one place. It prepares your application, then drafts the
follow-up message to the hiring contact once it has gone out.

**What you give it:** The company, who you are contacting, and how you know them.

**What you get:** An application and a matching follow-up message, so nothing gets forgotten.

**Safety:** It always asks you to confirm before sending.

### A note on two things that are not available

Some capabilities described elsewhere in Stage7 are **not** available in the Career Coach:

- There is no report generation skill and no workspace reset skill.
- There is no Notion or Gmail synchronisation. The assistant will never ask you for a password or a
  private key - if anything ever does, close it and do not enter your details.

---

## A Sensible Order To Work In

Each step feeds the next, so doing them in order saves a lot of back-and-forth.

1. **Save your profile.** Five minutes now saves hours later.
2. **Save your resume template.** So applications have something to use.
3. **Find some roles.** Job Discovery & Fit Ranking. Give it a handful of company names you would be
   happy to work for, or just run it and use the roles from your saved profile.
4. **Check your ranking.** Adjust the weights in Rank Opportunities if the order does not match your
   priorities.
5. **See where you stand.** Resume & Market Positioning Advisor.
6. **Prepare applications.** Application & Outreach Manager, in practice mode. Read everything it drafts.
7. **Get ready for interviews.** Interview & Negotiation Prep, then as many practice rounds as you want.
8. **Apply for real.** Switch out of practice mode when you are happy with the materials.
9. **Track everything.** Record each outcome as it arrives.
10. **Follow up.** The outreach skills keep the conversations moving.
11. **Close the gaps.** Upskill & Learning Planner for the roles you nearly qualified for.

Add more companies to your profile and run discovery again whenever your target list changes. Running it
regularly is the point - new roles appear constantly, and a search only reflects what is posted today.

## Everyday Commands

Run these from your project folder.

| What you want to do | Mac or Linux | Windows |
| --- | --- | --- |
| First-time setup | `./setup.sh` | Double-click `setup.bat` |
| Start again after a restart | `docker compose up -d` | `docker compose up -d` |
| Shut it down | `docker compose down` | `docker compose down` |
| Rebuild after getting new changes | `./setup.sh` | Double-click `buildone.bat` |
| Quick rebuild, no reinstall | `./buildone.sh` | Double-click `buildone.bat` |
| Check it is running | `docker compose ps` | `docker compose ps` |

`setup` does the complete job: it checks Docker, sets up your settings file, rebuilds, and starts
everything. Reach for it first whenever something seems wrong. `buildone` is the faster option for a
routine rebuild.

## If Something Goes Wrong

**The web page will not load.** Wait a minute and refresh. If it still fails, run `docker compose ps` and
confirm Docker Desktop is running.

**The Career Coach is not in my list.** Check that `.env` contains `STAGE7_ASSISTANTS=career` and run
`./setup.sh` again (`buildone.bat` on Windows) to apply it.

**A skill says something is "not connected".** This is Stage7 telling you it is missing something it
needs, not a crash. The most common causes are:

- No AI model is set up. Check [Step 4](#step-4-connect-a-free-ai-model).
- Your profile is empty or incomplete. Run Profile Intake.
- No roles have been found yet. Run Job Discovery & Fit Ranking first.

**Job searches come back empty.** First look at the per-board report in the result - it tells you which
sources were searched and what each one returned. Then:

- **A board says "no board with that name."** The company posts somewhere else. Check the company's own
  careers page for the exact board name, or pin it in the Tools tab under **boardTokens**.
- **Everything says "unavailable."** Check your internet connection, then try fewer companies.
- **The boards worked but nothing matched.** Your filters are too tight. Widen the salary range, drop the
  location filter, or clear your search terms.
- **Only the aggregator rows are missing.** LinkedIn, Indeed, Glassdoor, Monster and Wellfound need the
  optional key from [Step 4b](#step-4b-search-linkedin-indeed-and-google-jobs-optional). The other
  sources work without it.

**An application says "job listing not found".** The role is not in your saved list. Run Job Discovery &
Fit Ranking, then use the roles it returns.

**A search only finds roles at big companies.** The three built-in sources cover companies that post
through Greenhouse, Ashby or Lever, which is most employers but not all. Add the optional key to reach
the long tail, and add specific company names to your profile for the ones you care about.

**My profile or saved roles disappeared after a rebuild.** This is expected until you do the one-time
step in [Making Your Job Search Permanent](#making-your-job-search-permanent). Out of the box your job
search details are kept in a temporary location that a full rebuild clears.

**The local model feels too slow.** That is normal on a modest computer, and it mostly affects the
practice interview and preparation skills. A smaller model runs faster.

**Nothing works and I am not sure why.** The fastest fix is usually to run setup again - it rebuilds
everything from scratch and re-applies your settings. It takes a few minutes but resolves most one-off
problems:

```bash
./setup.sh
```

On Windows, double-click `setup.bat` instead.

## Making Your Job Search Permanent

**Optional, but worth doing once you have invested time in your profile.**

By default your profile, saved roles, and application history are kept in a temporary location that gets
cleared whenever you rebuild. To keep them, you need to point Stage7 at a saved folder. This is a small,
one-time file edit.

1. Open the file called `docker-compose.yaml` in your project folder.
2. Find the section for `tool-executor` (it is written as `tool-executor:`).
3. Add these two lines underneath its existing settings, keeping the spacing:

   ```yaml
       volumes:
         - career_data:/data/career
   ```

4. At the very bottom of the same file, find the `volumes:` section and add one line:

   ```yaml
     career_data:
   ```

5. Open your `.env` file and add this line:

   ```dotenv
   CAREER_HOME=/data/career
   ```

6. Run setup again.

From now on your profile, ranked roles, and application history survive rebuilds and restarts.

## A Few Safety Notes

- **Your career data is yours.** Stage7 will not invent employers, salaries, or job listings to fill gaps.
  If it does not know something, it tells you.
- **Never paste a password, API key, or private key into a chat.** Store credentials in Stage7's Vault
  instead.
- **Read your applications before they go out.** Practice mode is on by default for a reason. Switch it off
  only when you trust what it produces.
- **It is a coach, not a lawyer.** For contract questions, disputes, or anything legally binding, talk to
  a real professional.
