import { test } from "node:test";
import assert from "node:assert/strict";
import { getActiveEngine } from "../src/ocr";

test("default OCR engine is a real one, not the stub", () => {
  const id = getActiveEngine().id;
  assert.notEqual(id, "stub");
  assert.equal(id, "tesseract");
});
