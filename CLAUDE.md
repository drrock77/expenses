# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Expense Reporter - A Next.js 15 application for automated expense report management. Integrates with TripIt (travel itineraries) and SAP Concur (expense reports) to streamline business travel expense workflows. Uses LLM services (OpenAI, Azure OpenAI, or Gemini) to parse PDF credit card statements and extract/categorize transactions.

## Commands

```bash
cd expense-reporter
npm run dev      # Start dev server with Turbopack (port 3000)
npm run build    # Production build
npm run lint     # ESLint with Next.js rules
```

## Architecture

### App Structure (Next.js App Router)
- `/` redirects to `/dashboard`
- `/dashboard` - Main view: TripIt trips + Concur expense reports
- `/expenses` - Expense report management (placeholder)
- `/receipts` - Receipt management (placeholder)
- `/settings` - OAuth connection management for TripIt/Concur

### Core Services (`lib/services/`)
| Service | Purpose |
|---------|---------|
| `ConcurService` | SAP Concur API v3.0 - reports, expenses, receipts |
| `TripItService` | TripIt OAuth 1.0a API - trip retrieval |
| `LLMPDFParser` | PDF statement parsing via LLM (OpenAI/Azure/Gemini) |
| `OpenAIService` | OpenAI/Azure OpenAI client wrapper |
| `GeminiService` | Google Gemini client (supports direct PDF upload) |

### API Routes (`app/api/`)
- `parse-pdf/` - POST: Upload PDF, extract transactions via LLM
- `tripit/auth/` & `tripit/callback/` - OAuth 1.0a flow
- `concur/auth/` & `concur/callback/` - OAuth 2.0 flow

### Auth Storage
OAuth tokens stored in cookies: `tripit_access_token`, `tripit_access_token_secret`, `concur_access_token`

## Environment Variables

```
# LLM Provider (choose one)
LLM_PROVIDER=openai|azure|gemini

# OpenAI
OPENAI_API_KEY=

# Azure OpenAI
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_DEPLOYMENT=
AZURE_OPENAI_API_VERSION=

# Gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash

# TripIt OAuth 1.0a
TRIPIT_API_KEY=
TRIPIT_API_SECRET=

# Concur OAuth 2.0
CONCUR_CLIENT_ID=
CONCUR_CLIENT_SECRET=
```

## Key Types (`lib/types/expense.ts`)

- `Transaction` - Expense line item with receipt matching status
- `ExpenseReport` - Collection of transactions + per-diem items
- `TripInfo` - Travel itinerary from calendar/TripIt/manual entry
- `PerDiemItem` - Daily lodging/M&IE rates by location

## UI Components

Uses shadcn/ui with Radix primitives. Component files in `components/ui/`. Custom components in `components/expenses/`, `components/dashboard/`, `components/layout/`.
