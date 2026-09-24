# StudioStack Documentation

This folder is the starting point for product, design, and historical StudioStack documentation.

## Start here

1. Read [product-requirements.md](product-requirements.md) for the users, pages, permissions, and workflows the product is expected to support.
2. Read [brand-guidelines.md](brand-guidelines.md) before changing colors, typography, logos, or other visual-system decisions.
3. Use [historical/README.md](historical/README.md) to find the senior-project handoffs and presentation links.

## Reference

| Document | Use it when |
| --- | --- |
| [Product requirements](product-requirements.md) | You need to understand a page, user role, workflow, or notification requirement. |
| [Brand guidelines](brand-guidelines.md) | You are designing or reviewing StudioStack interface work. |
| [Historical documentation](historical/README.md) | You need context from earlier StudioStack teams. |

## Documentation rules

- Treat the Markdown files in this folder as the maintained project reference.
- Treat the PDFs in `historical/` as source material, not a description of the current implementation.
- Keep planned work clearly labeled so it is not confused with shipped functionality.
- Update the relevant document in the same pull request when behavior, access, or design rules change.
- Never place credentials, private keys, access tokens, or local environment files in this folder.

The active application lives in the repository root. The `legacy/` directory is archived reference code and should not receive new product work.
