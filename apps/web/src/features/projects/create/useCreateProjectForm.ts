import { useCallback, useState } from "react";
import { useForm } from "@mantine/form";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ICON_COLOR,
  normalizeProjectName,
  projectDescriptionProblem,
  PROJECT_IDENTIFIER_MAX,
  PROJECT_IDENTIFIER_PATTERN,
  projectNameProblem,
  suggestProjectIdentifier,
  type CreateProjectRequest,
  type ProjectCoverKey,
  type ProjectIcon,
} from "@repo/contracts";
import { pickRandomCover } from "../projectCovers";

export interface CreateProjectFormValues {
  name: string;
  identifier: string;
  description: string;
  icon: ProjectIcon;
  coverKey: ProjectCoverKey;
}

export function useCreateProjectForm() {
  const { t } = useTranslation();
  const [identifierTouched, setIdentifierTouched] = useState(false);

  const form = useForm<CreateProjectFormValues>({
    initialValues: {
      name: "",
      identifier: "",
      description: "",
      icon: {
        name: DEFAULT_PROJECT_ICON,
        color: DEFAULT_PROJECT_ICON_COLOR,
      },
      coverKey: pickRandomCover(),
    },
    validate: {
      name: (val) => {
        const problem = projectNameProblem(val);
        return problem ? t(problem.key, problem.params) : null;
      },
      identifier: (val) => {
        const trimmed = val.trim();
        if (!trimmed) {
          return t("project:errors.identifierRequired");
        }
        if (!PROJECT_IDENTIFIER_PATTERN.test(trimmed)) {
          return t("project:errors.identifierPattern");
        }
        return null;
      },
      description: (val) => {
        const problem = projectDescriptionProblem(val);
        return problem ? t(problem.key, problem.params) : null;
      },
    },
  });

  const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newName = event.currentTarget.value;
    form.setFieldValue("name", newName);
    if (!identifierTouched) {
      form.setFieldValue("identifier", suggestProjectIdentifier(newName));
    }
  };

  const handleIdentifierChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setIdentifierTouched(true);
    const upper = event.currentTarget.value
      .toUpperCase()
      .slice(0, PROJECT_IDENTIFIER_MAX);
    form.setFieldValue("identifier", upper);
  };

  const resetForm = useCallback(() => {
    form.setValues({
      name: "",
      identifier: "",
      description: "",
      icon: {
        name: DEFAULT_PROJECT_ICON,
        color: DEFAULT_PROJECT_ICON_COLOR,
      },
      coverKey: pickRandomCover(),
    });
    form.resetDirty();
    setIdentifierTouched(false);
  }, [form]);

  const isDirty =
    form.values.name.trim() !== "" ||
    form.values.identifier.trim() !== "" ||
    form.values.description.trim() !== "";

  const toRequest = (
    values: CreateProjectFormValues,
  ): CreateProjectRequest => ({
    name: normalizeProjectName(values.name),
    identifier: values.identifier.trim(),
    ...(values.description ? { description: values.description } : {}),
    icon: values.icon,
    coverKey: values.coverKey,
  });

  return {
    form,
    identifierTouched,
    handleNameChange,
    handleIdentifierChange,
    resetForm,
    isDirty,
    toRequest,
  };
}
