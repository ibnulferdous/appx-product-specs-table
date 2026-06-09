# Implement Template CRUD - Part 1: Schema & Empty State

## Proposed Changes

### Database Schema

#### [MODIFY] [schema.prisma](file:///g:/shopify-app/appx-product-specs-table-dev/prisma/schema.prisma)

Add the `Template` model and `TemplateStatus` enum as defined in `context/data-model.md`:

```prisma
model Template {
  id        String         @id @default(cuid())
  shopId    String
  shop      Shop           @relation(fields: [shopId], references: [id], onDelete: Cascade)

  name        String
  description String?
  status      TemplateStatus @default(DRAFT)

  // True for reusable templates. Future one-off product tables can set this false.
  isShared    Boolean        @default(true)

  // Full AG Grid row array. Array index is display order.
  // Each row must have stable id and key values.
  rows        Json           @default("[]")

  shopifyMetaobjectGid    String?
  shopifyMetaobjectHandle String?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  archivedAt  DateTime?

  @@index([shopId])
  @@index([shopId, status])
  @@unique([shopId, shopifyMetaobjectHandle])
}

enum TemplateStatus {
  DRAFT
  ACTIVE
  ARCHIVED
}
```

_Note: Do not include `ProductAssignment`, `ProductAssignmentIndex`, or `TableStyling` relationships in this migration, as per the incremental migration plan in `data-model.md`._

After modifying the schema, I will run:

1. `npx prisma migrate dev --name add-template`
2. `npx prisma generate`

### Application UI

#### [NEW] app.templates.tsx

Create the new Remix route for the Templates list at `app/routes/app.templates.tsx`.

- It will query the templates for the current shop using the loader.
- It will render a Polaris `Page` with a `Card` and an `IndexTable` (if templates exist) or an `EmptyState` (if no templates exist).
- It will have a primary action button to "Create template" (which will link to `app.templates.new` in the future).

#### [MODIFY] app.tsx (or navigation config)

- Add a link to the "Templates" page in the app navigation menu (Polaris `NavMenu`).

## Verification Plan

### Automated Tests

- Run `npm run build` to ensure the project compiles successfully.
