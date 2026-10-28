import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "./MarkdownEditor";

describe("MarkdownEditor", () => {
  function renderEditor(
    props: {
      value?: string;
      onChange?: (val: string) => void;
      label?: string;
      placeholder?: string;
      error?: string | null;
      readOnly?: boolean;
    } = {},
  ) {
    const user = userEvent.setup();
    const onChange = props.onChange ?? vi.fn();

    render(
      <AppUiProvider>
        <MarkdownEditor
          value={props.value ?? ""}
          onChange={onChange}
          label={props.label ?? "Description"}
          placeholder={props.placeholder ?? "Enter description"}
          error={props.error}
          readOnly={props.readOnly}
        />
      </AppUiProvider>,
    );

    return { user, onChange };
  }

  it("renders tabs Write and Preview, label, and Markdown supported note", () => {
    renderEditor();

    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Write" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Preview" })).toBeInTheDocument();
    expect(screen.getByText("Markdown supported")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Enter description"),
    ).toBeInTheDocument();
  });

  it("calls onChange when typing into the textarea in Write tab", async () => {
    const { user, onChange } = renderEditor();

    const textarea = screen.getByPlaceholderText("Enter description");
    await user.type(textarea, "Hello world");

    expect(onChange).toHaveBeenCalled();
  });

  it("switches to Preview tab and displays markdown preview (AC-21)", async () => {
    const { user } = renderEditor({ value: "# My Title\n\nSome text" });

    // Initially in Write tab: textarea is present, heading is not in DOM (keepMounted=false)
    expect(
      screen.getByPlaceholderText("Enter description"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 1, name: "My Title" }),
    ).toBeNull();

    // Switch to Preview tab
    const previewTab = screen.getByRole("tab", { name: "Preview" });
    await user.click(previewTab);

    // Preview is now rendered
    expect(
      screen.getByRole("heading", { level: 1, name: "My Title" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Some text")).toBeInTheDocument();
  });

  it("displays error message below tabs regardless of which tab is active", async () => {
    const { user } = renderEditor({
      value: "Some content",
      error: "Description is too long",
    });

    // Error visible in Write tab
    expect(screen.getByText("Description is too long")).toBeInTheDocument();

    // Switch to Preview tab
    await user.click(screen.getByRole("tab", { name: "Preview" }));

    // Error is still visible in Preview tab
    expect(screen.getByText("Description is too long")).toBeInTheDocument();
  });

  it("sets readOnly on textarea when readOnly prop is true", () => {
    renderEditor({ readOnly: true });

    const textarea = screen.getByPlaceholderText("Enter description");
    expect(textarea).toHaveAttribute("readonly");
  });
});
