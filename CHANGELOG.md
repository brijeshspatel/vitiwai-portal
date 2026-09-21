# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`VERSION` is the authoritative version source. It and this file move
together -- never one alone.

## [Unreleased]

## [0.1.0] - 2026-09-21

### Added

- Greenfield repository baseline provisioned by `provision.py`.
- AIA command layer and tooling installed at project scope under `.claude/`.
- Markdown governance adopted, verified by the repository's own checker.
- `VERSION` declared as the authoritative version source, paired with this
  changelog, per ADR 0005 D-7. Without both files the workflow's release step is
  a dead branch and the repository would never receive versioning at all.
- `main` and `dev` protected, and the workflow root created.
