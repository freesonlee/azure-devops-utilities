# Changelog

## 0.1.0-next.0 — Unpublished preview

- Extract the existing Terraform/CDKTF renderer into the standalone `tf-plan-viewer` component.
- Support JSON inputs, typed options/events, container layouts, and host-owned optional actions.
- Preserve the application's viewer styling and use bundled SVG icons.
- Isolate instance state, avoid host input mutation, and reset selection/reveal state on replacement.
- Validate renderer inputs, mask marked secrets, and require reveal before copying them.
- Package an optional Material theme, TypeScript types, MIT license, and third-party notices.
- Target Angular/Material/CDK 17.1.x; validate the preview on 17.1.1.
