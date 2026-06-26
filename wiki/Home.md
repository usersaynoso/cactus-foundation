<p align="center">
  <img src="cactus.svg" width="160" alt="Cactus CMS" />
</p>

# Cactus CMS

Cactus is a minimal, extensible, fast website platform built on Next.js 16, PostgreSQL, and Prisma. It ships with everything you need to run a content site — authentication, site configuration, roles and permissions, info pages with a visual page builder, navigation menus, user administration, a fully visual Appearance system, and a module registry — and nothing you don't.

## Philosophy: core plus modules

The Cactus core is deliberately narrow. Forums, articles, comments, e-commerce — these are separate **modules** added as git submodules. The core's job is to be a solid foundation that gets out of the way. A module adds its own database tables (namespaced so they never collide with core or each other), its own admin pages, its own permissions, and optionally its own public routes.

Every visual aspect of the frontend is user-configurable through the **Appearance** system: the header and footer are each a Puck visual editor, **Design Tokens** control colours/fonts/spacing as CSS variables, and **Layouts** define reusable page body structures. No hardcoded frontend design exists in the codebase.

## Wiki map

| Page | Contents |
|------|----------|
| [Getting started](Getting-started) | Prerequisites, cloning, environment variables, first deploy, setup wizard |
| [Configuration reference](Configuration-reference) | Every config-page tab and field |
| [Architecture overview](Architecture-overview) | Request flow, auth, sessions, media pipeline, Appearance system, module system |
| [Authoring a module](Authoring-a-module) | Complete guide to building and shipping a Cactus module |
| [Self-hosting and operations](Self-hosting-and-operations) | Backups, stale-row cleanup, monitoring, recovery procedures |
