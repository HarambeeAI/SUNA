# PRD: Worryless AI - Enterprise SaaS Platform

## Introduction

Worryless AI is a managed SaaS platform built on the open-source Kortix Suna foundation, designed to provide enterprises with a fully-hosted AI agent solution. By eliminating the complexity of self-hosting and infrastructure management, Worryless AI enables companies to deploy autonomous AI agents for business workflows without DevOps overhead. The platform offers a freemium model with pre-built agent templates, multi-tenant architecture, and enterprise-grade features that make AI agent deployment accessible to organizations of all sizes.

## Goals

- Launch a production-ready SaaS platform that removes self-hosting complexity from the Kortix Suna experience
- Provide enterprise customers with secure, scalable, multi-tenant AI agent infrastructure
- Build a curated marketplace of pre-built agent templates for common business use cases
- Enable team collaboration with organization workspaces, role-based access control, and shared agents
- Implement freemium monetization with clear upgrade paths from free to paid tiers
- Achieve 100+ enterprise signups within 6 months of launch
- Maintain 99.9% uptime SLA for paid customers

## User Stories

### US-001: Multi-tenant database schema
**Description:** As a platform engineer, I need to implement multi-tenant database architecture so that enterprise customers have isolated, secure data environments.

**Acceptance Criteria:**
- [x] Add `organizations` table with fields: id, name, slug, plan_tier, billing_status, created_at
- [x] Add `organization_members` table with fields: id, org_id, user_id, role, invited_by, joined_at
- [x] Add `org_id` foreign key column to `threads`, `agents`, and `agent_runs` tables
- [x] Create database migration files for all schema changes
- [x] Add row-level security (RLS) policies to enforce tenant isolation
- [x] Typecheck passes

### US-002: Organization creation and management API
**Description:** As a backend developer, I need API endpoints for organization management so users can create and manage their workspaces.

**Acceptance Criteria:**
- [x] POST `/v1/organizations` endpoint creates new organization
- [x] GET `/v1/organizations/:id` returns organization details with member list
- [x] PATCH `/v1/organizations/:id` updates organization name/settings
- [x] Endpoint validates user has owner/admin role for mutations
- [x] Returns 403 for unauthorized access attempts
- [x] Typecheck passes

### US-003: Team member invitation system
**Description:** As an organization admin, I want to invite team members to my workspace so we can collaborate on agents.

**Acceptance Criteria:**
- [x] POST `/v1/organizations/:id/invitations` endpoint sends email invitation
- [x] Invitation email contains unique token and accept/decline links
- [x] POST `/v1/invitations/:token/accept` adds user to organization
- [x] Invitations expire after 7 days
- [x] Track invitation status: pending, accepted, expired, revoked
- [x] Typecheck passes

### US-004: Role-based access control (RBAC)
**Description:** As a platform engineer, I need RBAC implementation so organizations can control member permissions.

**Acceptance Criteria:**
- [x] Define roles: owner, admin, member, viewer
- [x] Owner: full control including billing and deletion
- [x] Admin: manage members, agents, settings (no billing)
- [x] Member: create and manage own agents, view shared agents
- [x] Viewer: read-only access to organization agents
- [x] Middleware enforces role permissions on all org endpoints
- [x] Typecheck passes

### US-005: Organization context in authentication
**Description:** As a backend developer, I need to include organization context in auth tokens so all requests are properly scoped.

**Acceptance Criteria:**
- [x] JWT tokens include `org_id` claim when user operates in org context
- [x] User can switch between personal workspace and organizations
- [x] GET `/v1/auth/context` returns current org_id and available organizations
- [x] POST `/v1/auth/context/switch` changes active organization
- [x] All agent/thread operations use active org_id from token
- [x] Typecheck passes

### US-006: Freemium plan tier schema
**Description:** As a product manager, I need to define plan tiers in the database so we can enforce usage limits.

**Acceptance Criteria:**
- [x] Add `plan_tiers` table with: tier_name, monthly_price, agent_limit, run_limit_monthly, features_json
- [x] Seed data: Free (0, 3 agents, 100 runs), Pro ($49, unlimited agents, 5000 runs), Enterprise (custom)
- [x] Add `current_usage` table tracking: org_id, period_start, agents_created, runs_executed
- [x] Reset usage counters monthly via cron job
- [x] Typecheck passes

### US-007: Usage limit enforcement
**Description:** As a platform engineer, I need to enforce plan limits so free users upgrade when they hit caps.

**Acceptance Criteria:**
- [x] Check agent creation against org's plan `agent_limit`
- [x] Check agent runs against org's `run_limit_monthly`
- [x] Return 402 Payment Required when limit exceeded
- [x] Include upgrade CTA in error response
- [x] Log limit hits to analytics for conversion tracking
- [x] Typecheck passes

### US-008: Stripe subscription integration
**Description:** As a developer, I need Stripe subscription management so users can upgrade to paid plans.

**Acceptance Criteria:**
- [x] POST `/v1/billing/checkout` creates Stripe checkout session
- [x] Webhook `/api/webhooks/stripe` handles subscription events
- [x] On `checkout.session.completed`: update org `plan_tier` and `billing_status`
- [x] On `customer.subscription.deleted`: downgrade org to free tier
- [x] On `invoice.payment_failed`: set billing_status to past_due
- [x] Store Stripe customer_id and subscription_id on organization
- [x] Typecheck passes

### US-009: Organization settings page UI
**Description:** As an organization admin, I want a settings page to manage my workspace so I can configure everything in one place.

**Acceptance Criteria:**
- [x] Settings page shows: organization name, plan tier, billing status, usage stats
- [x] Editable fields: organization name, default agent settings
- [x] Display current usage: agents created, runs this month, percentage of limits
- [x] "Upgrade Plan" button for free tier users links to checkout
- [x] "Manage Billing" button for paid users opens Stripe portal
- [x] Typecheck passes
- [ ] Verify changes work in browser

### US-010: Team members management UI
**Description:** As an organization admin, I want to see and manage team members so I can control workspace access.

**Acceptance Criteria:**
- [x] Members tab shows table: name, email, role, joined date, actions
- [x] "Invite Member" button opens modal with email and role selection
- [x] Change role dropdown (disabled for owners)
- [x] Remove member button with confirmation dialog
- [x] Show pending invitations with option to resend or revoke
- [x] Typecheck passes
- [ ] Verify changes work in browser

### US-011: Organization switcher in navigation
**Description:** As a user with multiple organizations, I want to switch between them so I can access different workspaces.

**Acceptance Criteria:**
- [x] Dropdown in navbar shows: Personal, Organization A, Organization B, etc.
- [x] Display current active organization with checkmark
- [x] Clicking switches context and reloads thread list
- [x] "Create Organization" option at bottom of dropdown
- [x] Show organization logo/avatar if available
- [x] Typecheck passes
- [ ] Verify changes work in browser

### US-012: Agent template schema and storage
**Description:** As a platform engineer, I need to store agent templates so users can quickly deploy pre-configured agents.

**Acceptance Criteria:**
- [x] Add `agent_templates` table: id, name, description, category, system_prompt, tools_config, is_public, created_by
- [x] Add `template_categories` table: id, name, slug, icon, sort_order
- [x] Seed initial categories: Customer Service, Sales, Research, Content Creation, Data Analysis
- [x] Template versioning: store template_version for future updates
- [x] Typecheck passes

### US-013: Agent template creation API
**Description:** As a backend developer, I need API endpoints for template management so we can build the marketplace.

**Acceptance Criteria:**
- [x] POST `/v1/templates` creates new agent template
- [x] GET `/v1/templates` returns paginated public templates
- [x] GET `/v1/templates/:id` returns template details
- [x] PATCH `/v1/templates/:id` updates template (creator only)
- [x] Filter by category via query param `?category=sales`
- [x] Search templates by name/description via `?search=customer`
- [x] Typecheck passes

### US-014: Create agent from template endpoint
**Description:** As a user, I want to instantiate agents from templates so I can quickly deploy pre-configured solutions.

**Acceptance Criteria:**
- [x] POST `/v1/agents/from-template/:template_id` creates new agent
- [x] Copies system_prompt and tools_config from template
- [x] User can override agent name in request body
- [x] Validate user hasn't exceeded their plan's agent limit
- [x] Track template usage: increment `times_used` counter on template
- [x] Typecheck passes

### US-015: Seed initial agent templates
**Description:** As a product manager, I need high-quality starter templates so users see immediate value.

**Acceptance Criteria:**
- [ ] Customer Service Agent: handles support tickets, FAQ lookup, ticket routing
- [ ] Sales Research Agent: company research, lead enrichment, prospect outreach
- [ ] Content Writer Agent: blog posts, social media, SEO optimization
- [ ] Data Analyst Agent: CSV analysis, visualization, report generation
- [ ] Meeting Assistant Agent: schedule meetings, send reminders, take notes
- [ ] Each template has detailed description, example use cases, recommended settings
- [ ] Typecheck passes

### US-016: Template marketplace UI
**Description:** As a user, I want to browse agent templates so I can discover and deploy useful agents.

**Acceptance Criteria:**
- [ ] Templates page shows grid of template cards with: icon, name, description, category badge, "Use Template" button
- [ ] Filter by category tabs at top
- [ ] Search bar filters templates in real-time
- [ ] Template detail modal shows: full description, example prompts, configuration options
- [ ] "Use Template" opens dialog: enter agent name, confirm, creates agent
- [ ] Success toast: "Agent created! Redirecting..." then navigate to new agent thread
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-017: Template preview in agent creation
**Description:** As a user creating an agent, I want to optionally start from a template so I don't build from scratch.

**Acceptance Criteria:**
- [ ] Agent creation modal has two tabs: "Blank Agent" and "From Template"
- [ ] From Template tab shows mini template browser (same UI as marketplace)
- [ ] Selecting template pre-fills system prompt and tool configuration
- [ ] User can still edit all fields before creating
- [ ] "View Full Template" link opens template detail modal
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-018: Shared agents within organization
**Description:** As an organization member, I want to see agents created by teammates so we can collaborate on shared workflows.

**Acceptance Criteria:**
- [ ] Agents list shows two sections: "My Agents" and "Team Agents"
- [ ] Team Agents section lists all agents in the organization
- [ ] Agent cards show creator name and avatar
- [ ] Filter agents by creator via dropdown
- [ ] Organization admins can delete any team agent
- [ ] Members can only delete their own agents
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-019: Agent sharing permissions
**Description:** As an agent creator, I want to control who in my organization can use my agent so I can manage access.

**Acceptance Criteria:**
- [ ] Add `visibility` field to agents: private, org, public
- [ ] Private: only creator can see and use
- [ ] Org: all organization members can see and use
- [ ] Public: listed in public marketplace (future feature)
- [ ] Agent settings modal has "Visibility" dropdown
- [ ] Default visibility: org for organization members, private for personal
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-020: Organization usage dashboard
**Description:** As an organization owner, I want to see usage analytics so I can make informed decisions about our plan.

**Acceptance Criteria:**
- [ ] Dashboard shows: total agents, active agents (used in last 30 days), total runs this month
- [ ] Line chart: agent runs over time (last 30 days)
- [ ] Bar chart: runs by agent (top 10 most active)
- [ ] Table: most active users by run count
- [ ] Usage percentage indicators with warnings at 80% and 100%
- [ ] Export usage data as CSV button
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-021: Onboarding flow for new organizations
**Description:** As a new user, I want guided onboarding so I understand how to use Worryless AI effectively.

**Acceptance Criteria:**
- [ ] After signup, show modal: "Welcome to Worryless AI! Let's get started"
- [ ] Step 1: Create organization or skip to personal workspace
- [ ] Step 2: Choose from featured templates or create blank agent
- [ ] Step 3: Interactive tutorial: send first message to agent
- [ ] Step 4: Show tips: invite team, explore templates, upgrade plan
- [ ] Onboarding dismissible and resumable via "Help" menu
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-022: Billing portal integration
**Description:** As a paid customer, I want to manage my subscription so I can update payment methods and view invoices.

**Acceptance Criteria:**
- [ ] "Manage Billing" button in settings opens Stripe Customer Portal
- [ ] POST `/v1/billing/portal` creates portal session with return URL
- [ ] Portal allows: update payment method, view invoices, cancel subscription
- [ ] After portal actions, user redirected back to settings with success message
- [ ] Handle subscription cancellation gracefully: downgrade to free at period end
- [ ] Typecheck passes

### US-023: Email notifications for billing events
**Description:** As an organization owner, I want email notifications for billing events so I stay informed about my subscription.

**Acceptance Criteria:**
- [ ] Email on subscription created: "Welcome to Worryless AI Pro!"
- [ ] Email on payment success: "Your payment was processed successfully"
- [ ] Email on payment failure: "Action required: Update your payment method"
- [ ] Email on approaching usage limit (80%): "You're approaching your plan limit"
- [ ] Email on hitting usage limit: "You've reached your plan limit - Upgrade to continue"
- [ ] All emails use branded template with clear CTAs
- [ ] Typecheck passes

### US-024: Agent run cost calculation
**Description:** As a platform engineer, I need to calculate and track agent run costs so we can analyze unit economics.

**Acceptance Criteria:**
- [ ] Add `cost_usd` and `tokens_used` columns to `agent_runs` table
- [ ] Calculate cost based on LLM provider pricing (OpenAI, Anthropic)
- [ ] Store input_tokens, output_tokens, total_tokens separately
- [ ] Track tool execution time and attribute costs
- [ ] Organization usage dashboard shows total cost this month (for internal analytics)
- [ ] Typecheck passes

### US-025: Rate limiting for free tier
**Description:** As a platform engineer, I need to implement rate limiting so free tier users don't abuse the system.

**Acceptance Criteria:**
- [ ] Free tier: max 10 agent runs per hour per user
- [ ] Pro tier: max 100 agent runs per hour per user
- [ ] Enterprise tier: no rate limit
- [ ] Rate limit tracked via Redis with sliding window
- [ ] Return 429 Too Many Requests when limit exceeded
- [ ] Response includes `Retry-After` header with seconds to wait
- [ ] Typecheck passes

### US-026: Public agent sharing links
**Description:** As an organization member, I want to generate public share links for agents so I can demo them externally.

**Acceptance Criteria:**
- [ ] Agent settings has "Share Publicly" toggle
- [ ] When enabled, generate unique share token
- [ ] Public URL format: `/share/agent/:token`
- [ ] Public page shows agent name, description, interactive chat
- [ ] Track public usage separately: runs don't count toward org limits
- [ ] Ability to revoke public access (delete token)
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-027: Template submission by users
**Description:** As a user who built a great agent, I want to submit it as a template so others can benefit.

**Acceptance Criteria:**
- [ ] "Submit as Template" button in agent settings
- [ ] Submission form: template name, description, category, example use cases
- [ ] Submissions go to moderation queue (admin review required)
- [ ] GET `/v1/admin/template-submissions` endpoint for admin review
- [ ] Admin can approve (publish) or reject with reason
- [ ] Email user on approval: "Your template is now live!"
- [ ] Typecheck passes

### US-028: Admin panel for platform management
**Description:** As a platform admin, I want an admin dashboard so I can monitor the platform and moderate content.

**Acceptance Criteria:**
- [ ] Admin-only route `/admin` with authentication check
- [ ] Overview stats: total users, organizations, agents, runs today
- [ ] Template submissions list with approve/reject actions
- [ ] Organizations list with ability to change plan tier
- [ ] User list with ability to suspend/unsuspend accounts
- [ ] System health: API response times, error rates, background job queue length
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-029: Agent performance monitoring
**Description:** As an organization admin, I want to see agent performance metrics so I can optimize our workflows.

**Acceptance Criteria:**
- [ ] Per-agent analytics page: total runs, success rate, avg duration, cost
- [ ] Success rate calculation: runs without errors / total runs
- [ ] Chart: runs over time (last 30 days) with success/failure breakdown
- [ ] Table: slowest tool executions (identify bottlenecks)
- [ ] Export agent run logs as JSON for debugging
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-030: API key management for programmatic access
**Description:** As a developer, I want to generate API keys so I can integrate Worryless AI into my applications.

**Acceptance Criteria:**
- [ ] API Keys section in organization settings
- [ ] "Generate API Key" button creates new key with scopes
- [ ] Scopes: read:agents, write:agents, execute:agents, read:templates
- [ ] Display key once on creation with copy button, then show only prefix
- [ ] List existing keys with: name, prefix, created date, last used, revoke button
- [ ] Keys authenticate via `Authorization: Bearer <key>` header
- [ ] Typecheck passes
- [ ] Verify changes work in browser

## Non-Goals

- Mobile native applications (focus on web-first, responsive design sufficient for v1)
- On-premise deployment options (cloud-only for MVP)
- White-label/reseller functionality (future consideration)
- Custom LLM model training or fine-tuning
- Real-time collaboration features (live multi-user editing)
- Video/audio processing capabilities beyond text
- Blockchain or cryptocurrency integrations
- AI agent marketplace revenue sharing (all templates free for v1)
- Third-party integrations marketplace (focus on core agent templates)
- Advanced workflow automation builder (simple sequential workflows only)

## Technical Considerations

### Infrastructure
- **Hosting:** Deploy on AWS using ECS/Fargate for containerized services
- **Database:** Use Supabase (PostgreSQL) with read replicas for scaling
- **Caching:** Redis for rate limiting, session management, and queue management
- **CDN:** CloudFront for static assets and global content delivery
- **Storage:** S3 for file uploads, agent outputs, and backups

### Security & Compliance
- **Authentication:** Leverage existing Supabase Auth with organization context
- **Data Isolation:** Strict row-level security policies for multi-tenancy
- **Encryption:** TLS 1.3 for transport, AES-256 for data at rest
- **Audit Logging:** Track all organization-level actions for compliance
- **SOC 2 Compliance:** Plan for Type II certification within 12 months

### Reuse Existing Kortix Components
- **Frontend:** Build on existing Next.js/React codebase with organization layer
- **Backend:** Extend FastAPI backend with multi-tenant routes
- **Agent Runtime:** Leverage existing Docker/Daytona sandbox infrastructure
- **Tool System:** Use existing tool registry and execution pipeline
- **LLM Integration:** Continue using LiteLLM for multi-provider support

### Performance Targets
- API response time: p95 < 200ms for non-agent endpoints
- Agent startup time: < 3 seconds from run trigger to first tool execution
- Dashboard load time: < 1 second for initial page render
- Concurrent agents: Support 1000+ simultaneous agent runs

### Monitoring & Observability
- Application Performance Monitoring (APM) via Datadog or New Relic
- Error tracking with Sentry
- Custom metrics: agent runs, template usage, conversion rates
- Log aggregation with CloudWatch or ELK stack

## Success Metrics

### Business Metrics
- **Customer Acquisition:** 100+ enterprise signups in first 6 months
- **Conversion Rate:** 15% free-to-paid conversion within 30 days
- **Revenue:** $50K MRR by month 6
- **Retention:** 90% monthly retention for paid customers
- **NPS Score:** > 50

### Product Metrics
- **Agent Creation:** Avg 3 agents per organization
- **Template Usage:** 70% of agents created from templates
- **Engagement:** 50+ agent runs per organization per month
- **Team Adoption:** Avg 5 members per paying organization
- **Time to Value:** Users create first agent within 5 minutes of signup

### Technical Metrics
- **Uptime:** 99.9% availability for paid tier
- **Agent Success Rate:** > 95% of runs complete without errors
- **API Performance:** p95 latency < 200ms
- **Support Tickets:** < 5% of users submit tickets per month

## Launch Strategy

### Phase 1: Private Beta (Weeks 1-4)
- Invite 20 design partner companies
- Focus on customer service and sales agent templates
- Gather feedback on onboarding, UX, and pricing
- Iterate on core features based on usage patterns

### Phase 2: Public Beta (Weeks 5-8)
- Open signups with waitlist
- Launch with 5 polished agent templates
- Implement freemium model with clear upgrade paths
- Begin content marketing (blog posts, case studies)

### Phase 3: General Availability (Weeks 9-12)
- Remove waitlist, full public launch
- Add 10+ additional agent templates based on demand
- Implement all enterprise features (RBAC, SSO prep, audit logs)
- Launch partner program for system integrators

## Dependencies

- Stripe account setup and webhook configuration
- Email service provider (SendGrid, Postmark) for transactional emails
- Domain and SSL certificates for production deployment
- AWS account with sufficient service limits (EC2, RDS, S3)
- Legal review of Terms of Service and Privacy Policy
- Customer support ticketing system (Intercom, Zendesk)
- Analytics platform setup (Mixpanel, Amplitude)

## Open Questions

- **Pricing validation:** Is $49/month for Pro tier competitive with alternatives?
- **Enterprise custom pricing:** What threshold (seats, usage) triggers enterprise sales?
- **Template curation:** Should we limit initial templates to 5-10 high-quality ones or launch with 20+?
- **Agent limits:** Are 3 agents for free tier and unlimited for Pro the right thresholds?
- **API rate limits:** Do current limits (10/hr free, 100/hr pro) align with expected usage?
- **Priority support:** Should Pro tier include faster support response times?
- **SSO requirement:** How many enterprise prospects require SSO before considering?
