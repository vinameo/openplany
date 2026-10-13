import { Table, VisuallyHidden } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppUiProvider } from "./provider";

describe("theme", () => {
  describe("Table.ScrollContainer", () => {
    it("is the containing block for a hidden caption, so a wide table cannot widen the page", () => {
      render(
        <AppUiProvider>
          <Table.ScrollContainer minWidth={760} type="native">
            <Table aria-label="Members">
              <Table.Caption>
                <VisuallyHidden>Members</VisuallyHidden>
              </Table.Caption>
            </Table>
          </Table.ScrollContainer>
        </AppUiProvider>,
      );

      const scrollContainer = screen
        .getByRole("table", { name: "Members" })
        .closest(".mantine-TableScrollContainer-scrollContainer");

      expect(scrollContainer).toHaveStyle({ position: "relative" });
    });
  });
});
