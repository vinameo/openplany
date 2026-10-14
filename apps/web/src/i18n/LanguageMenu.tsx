import { ActionIcon, Menu, Text, type ActionIconProps } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  NATIVE_LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  type Language,
} from "@repo/contracts";
import { getLanguage, setLanguage } from "./language";

export type LanguageMenuProps = Omit<ActionIconProps, "children">;

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function LanguageMenu({ ...actionIconProps }: LanguageMenuProps) {
  const { t, i18n } = useTranslation();
  const currentLanguage: Language = (
    SUPPORTED_LANGUAGES as readonly string[]
  ).includes(i18n.language)
    ? (i18n.language as Language)
    : getLanguage();

  const buttonLabel = t("common:language.buttonAriaLabel");

  return (
    <Menu shadow="md" width={160} position="bottom-end">
      <Menu.Target>
        <ActionIcon
          variant="default"
          size="lg"
          radius="md"
          aria-label={buttonLabel}
          title={buttonLabel}
          {...actionIconProps}
        >
          <Text fw={700} size="xs">
            {currentLanguage.toUpperCase()}
          </Text>
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isSelected = lang === currentLanguage;
          return (
            <Menu.Item
              key={lang}
              renderRoot={(itemProps) => (
                <button
                  {...itemProps}
                  role="menuitemradio"
                  aria-checked={isSelected}
                  lang={lang}
                />
              )}
              rightSection={isSelected ? <CheckIcon /> : null}
              onClick={() => {
                if (!isSelected) {
                  setLanguage(lang);
                }
              }}
            >
              {NATIVE_LANGUAGE_NAMES[lang]}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}
