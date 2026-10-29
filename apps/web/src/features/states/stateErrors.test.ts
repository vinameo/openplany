import { describe, expect, it } from "vitest";
import { ApiRequestError } from "../../lib/apiClient";
import { parseStateError } from "./stateErrors";

const t = (key: string) => key;

function validationError(fields: Record<string, string>): ApiRequestError {
  return new ApiRequestError(400, {
    code: "VALIDATION_ERROR",
    message: "Translated by the API",
    fields,
  });
}

describe("parseStateError", () => {
  describe("VALIDATION_ERROR", () => {
    it("puts a name error on the field only", () => {
      expect(parseStateError(validationError({ name: "Too long" }), t)).toEqual(
        { fieldErrors: { name: "Too long" } },
      );
    });

    it("shows the API message for the class-level error keyed ''", () => {
      expect(
        parseStateError(validationError({ "": "Nothing to update" }), t),
      ).toEqual({ message: "Translated by the API" });
    });

    it("shows both the name error and the message when other fields fail too", () => {
      expect(
        parseStateError(validationError({ name: "Bad", color: "Bad" }), t),
      ).toEqual({
        fieldErrors: { name: "Bad" },
        message: "Translated by the API",
      });
    });
  });

  it("falls back to the generic sentence for a non-API error", () => {
    expect(parseStateError(new TypeError("boom"), t)).toEqual({
      message: "state:errors.generic",
    });
  });
});
