import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input, Tabs, Text, Textarea } from "@mantine/core";
import { MarkdownPreview } from "./MarkdownPreview";
import classes from "./markdown.module.css";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  label?: React.ReactNode;
  placeholder?: string;
  error?: React.ReactNode;
  readOnly?: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  label,
  placeholder,
  error,
  readOnly,
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string | null>("write");

  return (
    <div className={classes.editorRoot}>
      {label && <Input.Label>{label}</Input.Label>}

      <Tabs value={activeTab} onChange={setActiveTab} variant="outline">
        <div className={classes.tabList}>
          <Tabs.List>
            <Tabs.Tab value="write">{t("workItem:markdown.write")}</Tabs.Tab>
            <Tabs.Tab value="preview">
              {t("workItem:markdown.preview")}
            </Tabs.Tab>
          </Tabs.List>

          <Text className={classes.supportedText}>
            {t("workItem:markdown.supported")}
          </Text>
        </div>

        <Tabs.Panel value="write" pt="xs">
          <Textarea
            autosize={import.meta.env.MODE !== "test"}
            minRows={6}
            maxRows={20}
            rows={6}
            value={value}
            onChange={(e) => onChange(e.currentTarget.value)}
            placeholder={placeholder}
            readOnly={readOnly}
            aria-label={typeof label === "string" ? label : placeholder}
          />
        </Tabs.Panel>

        <Tabs.Panel value="preview" pt="xs" keepMounted={false}>
          <MarkdownPreview source={value} />
        </Tabs.Panel>
      </Tabs>

      {error && <Input.Error>{error}</Input.Error>}
    </div>
  );
}
