import { describe, it } from "vitest";

describe("forge register", () => {
  it.todo("IDENT-01: registers current git user as a developer");
  it.todo("IDENT-01: uses --name override when provided");
  it.todo("IDENT-01: errors when git user.name not configured and no --name given");
  it.todo("IDENT-01: updates last_active if already registered");
});

describe("forge team", () => {
  it.todo("IDENT-02: lists all registered developers in a table");
  it.todo("IDENT-02: shows message when no developers registered");
});
