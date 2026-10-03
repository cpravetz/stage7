# Content Assistant Documentation (Version 9)

**Assistant ID:** `content`
**Assistant Name:** Content Strategy & Publishing Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Content Strategy & Publishing Assistant oversees editorial lifecycle management, search engine optimization (SEO) strategy, long-form article drafting, content calendar scheduling, and automated publishing dispatches to connected Content Management Systems (CMS) such as WordPress and Ghost.

---

## 2. Domain Knowledge

The Content Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/seo-content-frameworks.md`**: Topic cluster strategy, semantic keyword grouping, search intent classification (informational, transactional, navigational), and schema markup specifications.
2. **`knowledge/editorial-style-guide.md`**: Corporate tone and voice rules, brand readability standards, grammar conventions, citation formatting, and plagiarist/AI detection parameters.

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `content-strategy-seo-evaluator`
* **Purpose:** Conducts content gap analysis and evaluates search performance telemetry against competitors.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Weekly SEO audit
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "contentItems": { "type": "array", "items": { "type": "object" } },
      "metrics": { "type": "object", "description": "Organic traffic, impressions, keyword rankings" }
    },
    "required": ["contentItems"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** SEO telemetry
* **Produces:** Keyword gap report, content refresh priorities, and content pillar recommendations.

### 3.2 `editorial-calendar-article-copilot`
* **Purpose:** Drafts long-form articles, structures content outlines, and schedules items into editorial calendars.
* **Tier:** `aid`
* **Trigger:** **Event** — Keyword gap identified
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "topics": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["topics"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Internal style guide
* **Produces:** Structured article draft with headings, meta descriptions, and updated editorial calendar entries.

### 3.3 `governed-publishing-cms-dispatcher`
* **Purpose:** Publishes approved content directly to target CMS platforms (WordPress, Ghost, Webflow) with appropriate metadata and tags.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Event** — Draft approved
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "channel": { "type": "string", "description": "e.g., wordpress, ghost, webflow" },
      "contentId": { "type": "string" },
      "title": { "type": "string" }
    },
    "required": ["channel", "contentId", "title"]
  }
  ```
* **Config Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "endpointUrl": { "type": "string" },
      "token": { "type": "string", "description": "Secret CMS API token" }
    },
    "required": ["endpointUrl", "token"]
  }
  ```
* **Consumes:** CMS REST APIs
* **Produces:** Live post payload, permalink URL dispatch, and publishing status log.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

*(Note: Content Assistant executes publishing actions directly via configured CMS REST endpoints within `governed-publishing-cms-dispatcher`.)*

---

## 5. Major Data Types & Contracts

### 5.1 Article Draft Schema
```typescript
interface ArticleDraft {
  id: string;
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  markdownContent: string;
  status: 'draft' | 'review' | 'approved' | 'published';
  targetPublishDate?: string;
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - Multi-CMS credentials (tokens) are stored in individual skill configuration; they should leverage `services/vault` for unified secret storage.
   - Image assets and feature media uploads are currently handled outside the markdown dispatch pipeline.

2. **Enhancement Opportunities:**
   - Add automated image generation and ALT text optimization into `editorial-calendar-article-copilot`.
   - Incorporate real-time Google Search Console API integration for automated ranking verification.
