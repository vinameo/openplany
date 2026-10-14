import type { ViCatalog } from "./types.js";

export const vi: ViCatalog = {
  common: {
    "roles.workspace.admin": "Admin",
    "roles.workspace.member": "Member",
    "roles.workspace.guest": "Guest",
    "roles.project.admin": "Project Admin",
    "roles.project.contributor": "Contributor",
    "roles.project.commenter": "Commenter",
    "roles.project.viewer": "Viewer",
    "test.minute_other": "{{count}} phút",
  },
  auth: {
    signIn: "Đăng nhập",
  },
  errors: {
    invalidValue: "Dữ liệu gửi lên không hợp lệ",
    validationFailed: "Dữ liệu gửi lên không hợp lệ",
  },
  workspace: {
    title: "Workspace",
  },
  project: {
    title: "Dự án",
  },
  members: {
    title: "Thành viên",
  },
  admin: {
    title: "Quản trị",
  },
  profile: {
    title: "Hồ sơ",
  },
  permissions: {
    "project.archive": "Lưu trữ dự án",
  },
  permissionGroups: {
    "project.archive": "Dự án",
  },
} as const;
