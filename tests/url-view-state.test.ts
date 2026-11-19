/**
 * Shareable / reload-safe URL state for the WorkHub page (pure, no DB): a reload keeps the desk,
 * platform, date filter and open order drawer, and the link opens the same screen for a colleague.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseUrlViewState, buildUrlViewSearch, isNavigationChange } from "../src/lib/url-view-state";

describe("WorkHub URL view state", () => {
  it("round-trips desk, platform, date filter and drawer order", () => {
    const state = { view: "appointment" as const, channel: "BLINKIT_STO", date: "today" as const, order: "3f2b9c1e-8a4d-4c55" };
    const search = buildUrlViewSearch(state);
    assert.equal(search, "?view=appointment&channel=BLINKIT_STO&date=today&order=3f2b9c1e-8a4d-4c55");
    assert.deepEqual(parseUrlViewState(search), state);
  });
  it("defaults stay out of the URL", () => {
    assert.equal(buildUrlViewSearch({ view: "booking", channel: "ALL", date: "all" }), "");
  });
  it("ignores malformed values", () => {
    assert.deepEqual(parseUrlViewState("?view=admin&date=someday&channel=<x>&order=1"), {});
  });
  it("desk / platform changes add history, drawer and date only replace", () => {
    const base = { view: "booking" as const, channel: "ALL", date: "all" as const };
    assert.equal(isNavigationChange(base, { ...base, view: "kanban" }), true);
    assert.equal(isNavigationChange(base, { ...base, channel: "SWIGGY" }), true);
    assert.equal(isNavigationChange(base, { ...base, order: "abcdefgh" }), false);
    assert.equal(isNavigationChange(base, { ...base, date: "today" }), false);
  });
  it("the page reads the URL, mirrors it and handles Back / Forward", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf-8");
    assert.ok(page.includes("parseUrlViewState(window.location.search)"));
    assert.ok(page.includes("buildUrlViewSearch("));
    assert.ok(page.includes('addEventListener("popstate"'));
  });
});
