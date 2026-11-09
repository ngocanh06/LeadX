# LeadX Development Tasks

## Specification Summary
**Original Requirements**: LeadX - All-in-One Lead Intelligence & Marketing Automation Platform with Multi-Channel Scraper & Stealth Autopost Engine (Core, Recruitment, BDS, Marketing modules)
**Technical Stack**: Node.js, Express, Puppeteer, Vanilla JS, Modular Architecture
**Target Timeline**: Production Enterprise Deployment

## Development Tasks

### [ ] Task 1: API Security & Authentication Middleware
**Description**: Implement API Key / Token authentication middleware for sensitive `/api/*` endpoints (automation, campaigns, CRM).
**Acceptance Criteria**:
- Unauthorized requests to protected endpoints return HTTP 401.
- Authorized requests pass successfully.
- Static assets and health check remain publicly accessible.

**Files to Create/Edit**:
- src/core/middleware/auth.middleware.js
- src/server.js

**Reference**: Core security requirements

### [ ] Task 2: File Locking for JSON Persistence
**Description**: Implement safe file locking mechanism for JSON data stores (`data/**/*.json`) to prevent race conditions during concurrent writes (e.g. Scraper LiveSync + UI updates).
**Acceptance Criteria**:
- Concurrent write operations do not corrupt JSON files.
- Robust error handling and fallback parsing.

**Files to Create/Edit**:
- src/core/services/storageService.js

**Reference**: Data integrity & persistence guidelines

### [ ] Task 3: Automated Jest Testing Suite
**Description**: Set up Jest test runner and write unit tests for critical modules (Candidate Manager, BDS Apartment Manager, Seeding Engine).
**Acceptance Criteria**:
- `npm test` runs successfully.
- Core business logic functions have passing unit tests.

**Files to Create/Edit**:
- package.json
- tests/candidateManager.test.js

**Reference**: Quality assurance guidelines

### [ ] Task 4: Puppeteer Zombie Process Cleanup & Timeout Safeguards
**Description**: Ensure all Puppeteer browser instances are safely closed in `try...finally` blocks across all automation scripts.
**Acceptance Criteria**:
- No orphaned Chrome processes remain after scraping or posting tasks finish.
- Explicit timeouts configured for page navigation and selector waiting.

**Files to Create/Edit**:
- src/automation/browserController.js
- src/modules/recruitment/automation/*

**Reference**: Automation reliability requirements

## Quality Requirements
- [ ] No background processes in any commands - NEVER append `&`.
- [ ] No server startup commands - assume development server is running.
- [ ] Mobile responsive design required for all new dashboard views (Dark & Light modes).
- [ ] Form functionality and input validation fully functional.
- [ ] Images from approved sources (Unsplash, https://picsum.photos/) - NO Pexels (403 errors).
- [ ] Include automated test verification before deployment.

## Technical Notes
**Development Stack**: Node.js, Express, Puppeteer, HTML5/CSS3, Modular Architecture.
**Special Instructions**: Keep strict separation between Core platform, Recruitment, BDS, and Marketing modules.
**Timeline Expectations**: Realistic scope adhering to core functional requirements first, polish second.
