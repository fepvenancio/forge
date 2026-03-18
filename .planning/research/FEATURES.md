# Feature Landscape

**Domain:** Team coordination layer for AI-assisted multi-developer workflows
**Researched:** 2026-03-18

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Developer registry | Users need identity before any coordination works; every team tool has user management | Low | Dolt table + `forge register` CLI. GitHub username as ID keeps it simple. |
| Phase/task ownership & assignment | Core value prop -- knowing who owns what. GitKraken Team View, Jira, Linear all show this. Without it, Forge is just a git wrapper. | Medium | `forge claim`, `forge assign`, `forge release`. Must enforce 1:1:1 (phase = branch = developer). |
| Phase status tracking | Teams need visibility into progress. Every PM tool shows task state. | Low | Status enum (assigned, in_progress, pr_open, merged, blocked). Derived from git + PR state. |
| Branch management | Automatic branch creation on phase claim, enforced naming convention. Without this, devs create inconsistent branches. | Low | `gsd/phase-{N}-{slug}` template. Auto-create on `forge claim`. |
| Touch map conflict detection | The central differentiator that justifies Forge's existence. GitKraken charges premium for this. Without it, conflicts surface at PR time (too late). | High | Parse PLAN.md touch maps from phase branches, cross-compare file sets, flag overlaps. Must handle partial overlaps (same file, different functions). |
| CI gate pipeline | Standard for any team workflow tool. GitHub merge queues, Graphite, Trunk.io all provide this. PRs without quality gates are chaos. | Medium | GitHub Action running: flow freshness check, touch map conflict check, config validation, test suite. |
| Team status dashboard | Every coordination tool has a "who's doing what" view. Without it, devs ask on Slack instead of checking Forge. | Medium | Streamlit. Show phase ownership, PR status, active branches. Extend existing dashboard. |
| CLI-first interface | Developer tools must be CLI-first. IDE plugins are nice-to-have but CLI is the baseline. Graphite, gh, trunk all are CLI-first. | Medium | All `forge *` commands. Must feel as fast and ergonomic as `gh` CLI. |
| Cost tracking (basic) | With AI coding tools costing $200-500/dev/month, teams need visibility. GitHub added budget tracking in Nov 2025. Table stakes for AI-era tooling. | Medium | Per-developer, per-phase cost recording. Token counts + USD. `forge cost` report. |
| GSD artifact reading | Forge's entire coordination model depends on reading `.planning/` files. Without this, Forge is blind to what developers are actually doing. | Medium | Read ROADMAP.md, PLAN.md (touch maps), SUMMARY.md (completion), config.json. Read-only -- never write. |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Pre-PR conflict prediction | Most tools detect conflicts at merge time. Forge detects them at planning time -- before code is written. This is unique. GitKraken's conflict prevention only works on committed changes; Forge works on planned changes via touch maps. | High | Compare touch maps from PLAN.md across all active phases. Alert immediately on `forge claim` if phase plan overlaps with active work. |
| Advisory file locks | Softer than Perforce-style locks but more explicit than hoping. Trust-based coordination signal. No one else does "advisory" well -- it's either hard locks or nothing. | Low | `forge lock`, `forge unlock`, `forge locks`. Store in Dolt. Display in dashboard. Never block -- only warn. |
| Merge order engine | Multi-PR dependency analysis is rare. Graphite handles stacked PRs but not cross-developer dependency ordering. Forge can suggest "merge Phase 1 before Phase 3 because Phase 3 depends on Phase 1's schema changes." | High | Dependency graph from ROADMAP.md phase definitions. Topological sort. Post suggested order as PR comment when multiple PRs are open. |
| Shared roadmap as structured data | Instead of a Markdown file that drifts, the roadmap lives in Dolt (versioned SQL). `forge sync` pulls canonical version. Prevents the "my ROADMAP.md differs from yours" problem. | Medium | Dolt stores phase definitions, goals, success criteria. `forge sync` generates local `.planning/ROADMAP.md` from Dolt. Single source of truth. |
| Flow document freshness gate | Unique to Forge's existing v0.1.0. Blocks PRs when documentation is stale relative to code changes. No mainstream tool does this. | Low | Already built in Python gates. Keep and wire into CI pipeline. |
| Webhook-driven Librarian | Auto-updates flow documents on push events. Keeps docs fresh without developer discipline. Most tools leave docs to rot. | Medium | Existing Librarian agent. Trigger on GitHub push webhook. Update `.flows/` files. |
| Cost-per-PR analysis | Beyond per-developer tracking: show how much each PR (and by extension each feature) costs in AI tokens. GitHub's budget tracking is per-org, not per-PR. | Medium | Correlate developer cost reports with phase/PR. Show in dashboard and PR comment. |
| Human escalation hooks | When Forge detects a conflict it cannot resolve, escalate to Slack/Discord/Teams. Most CI tools just fail -- they don't route to humans intelligently. | Low | Already built. Wire conflict detection output to escalation webhook. |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Code generation / AI coding | Developers already use Claude Code + GSD. Forge duplicating this creates confusion about which AI is writing code. Stay in your lane. | Read GSD outputs. Never generate code. |
| Auto-merge | Mike Mason's research shows autonomous merging is dangerous -- Yegge's production DB went down for 2 days from auto-merged failing tests. Human judgment is essential for merge. | Suggest merge order. Never execute merges. |
| Enforced file locks | Hard locks kill velocity. Perforce-style locking is universally hated in Git workflows. Trust-based advisory locks preserve flow. | Advisory locks only. Warn, never block. |
| Task decomposition / planning | GSD handles this per-developer. Forge re-doing it creates conflicting plans and confuses the developer about which plan to follow. | Read PLAN.md from GSD. Surface conflicts. Never create plans. |
| Code review AI | GitHub Copilot review, CodeRabbit, etc. already do this well. Building another one adds no value and dilutes Forge's focus. | Integrate with existing review tools via webhooks if needed. |
| Multi-repo orchestration | Massively increases complexity for a v2. Monorepo is the right constraint. Multi-repo can come in v3+ if proven valuable. | Single repo focus. Document the constraint clearly. |
| IDE plugin | Building IDE integrations fragments attention. CLI + dashboard covers the use cases. IDE plugins can come later from community. | CLI-first. Dashboard for visualization. |
| Real-time collaborative editing | Google Docs-style co-editing is a different product entirely. Git branches are the coordination primitive here. | Phase isolation via branches. Conflict detection, not conflict prevention through shared editing. |
| Automated conflict resolution | AI-powered merge conflict resolution (MergeBERT etc.) achieves only 63-68% accuracy. Wrong resolutions are worse than manual resolution. | Detect and flag conflicts. Let developers resolve them. |

## Feature Dependencies

```
Developer Registry ──> Phase Assignment ──> Branch Management
                                       ──> Phase Status Tracking
                                       ──> Touch Map Conflict Detection ──> Pre-PR Conflict Prediction
                                                                        ──> Advisory File Locks
                                                                        ──> Merge Order Engine

GSD Artifact Reading ──> Touch Map Conflict Detection
                     ──> Shared Roadmap (structured data)
                     ──> Phase Status Tracking

CI Gate Pipeline ──> Flow Freshness Gate
                 ──> Touch Map Conflict Detection (as CI check)
                 ──> Cost-per-PR Analysis

Cost Tracking (basic) ──> Cost-per-PR Analysis
                      ──> Team Dashboard (cost views)

Webhook Infrastructure ──> Librarian (flow doc updates)
                       ──> Human Escalation Hooks
                       ──> CI Gate Pipeline triggers

Team Dashboard ──> Phase Assignment (ownership view)
               ──> Touch Map Conflict Detection (conflict map)
               ──> Cost Tracking (cost per dev/phase)
               ──> Advisory File Locks (lock map)
```

## MVP Recommendation

Prioritize (Phase 1-3 of implementation):

1. **Developer Registry** -- foundation for all coordination; trivial to build
2. **Phase Assignment & Branch Management** -- core coordination loop; without this there's nothing to coordinate
3. **GSD Artifact Reading** -- Forge must see what developers are doing before it can help
4. **Touch Map Conflict Detection** -- the killer feature; this is why Forge exists
5. **Team Status Dashboard (basic)** -- developers need to see the coordination state

Defer:

- **Merge Order Engine**: Valuable but complex; needs real multi-developer usage data before the dependency graph logic can be validated. Ship after 2+ devs are actively using Forge.
- **Cost-per-PR Analysis**: Nice-to-have refinement of basic cost tracking. Ship after basic cost tracking proves useful.
- **Shared Roadmap as Structured Data**: The local ROADMAP.md pattern from GSD works fine for small teams. Only becomes critical at 5+ developers.
- **Webhook-driven Librarian**: Already exists from v0.1.0 but wiring it to v2 can wait until CI gates are solid.

## Sources

- [GitKraken Conflict Prevention](https://help.gitkraken.com/gitkraken-desktop/conflict-prevention/) -- proactive conflict detection for committed changes
- [GitKraken Team View](https://help.gitkraken.com/gitkraken-desktop/team-view/) -- branch/file visibility across team
- [Graphite Merge Queue](https://graphite.dev/features/merge-queue) -- stack-aware merge queue, PR prioritization
- [Trunk.io Merge Queue](https://trunk.io/merge-queue) -- parallel queue processing, flaky test quarantine
- [Aviator MergeQueue](https://www.aviator.co/merge-queue) -- disjoint parallel queues for monorepos
- [AI Coding Agents: Coherence Through Orchestration (Mike Mason, Jan 2026)](https://mikemason.ca/writing/ai-coding-agents-jan-2026/) -- multi-agent coordination patterns, risks of auto-merge
- [GitHub Budget Tracking for AI Tools (Nov 2025)](https://github.blog/changelog/2025-11-03-control-ai-spending-with-budget-tracking-for-github-ai-tools/) -- org-level AI cost controls
- [The Real Cost of AI Coding Tools (Palma.ai)](https://palma.ai/blog/real-cost-of-ai-coding-tools) -- $200-500/dev/month all-in costs
- [Graphite: AI Merge Conflict Resolution Guide](https://www.graphite.com/guides/ai-code-merge-conflict-resolution) -- current state of AI-powered resolution (63-68% accuracy)
- [Martin Fowler: Branching Patterns](https://martinfowler.com/articles/branching-patterns.html) -- task branching, branch-per-feature strategies
