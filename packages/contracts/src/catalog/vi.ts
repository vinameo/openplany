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
    "theme.switchToLight": "Chuyển sang giao diện sáng",
    "theme.switchToDark": "Chuyển sang giao diện tối",
    "test.minute_other": "{{count}} phút",
  },
  auth: {
    signIn: "Đăng nhập",
    "errors.signInFailed": "Không thể đăng nhập. Vui lòng thử lại.",
  },
  errors: {
    genericError: "Đã có lỗi xảy ra. Vui lòng thử lại.",
    invalidValue: "Dữ liệu gửi lên không hợp lệ",
    validationFailed: "Dữ liệu gửi lên không hợp lệ",
    checkHighlightedFields: "Kiểm tra các trường được đánh dấu",
    foreignKeyViolation: "Dữ liệu liên kết không hợp lệ",
    "http.validationError": "Dữ liệu gửi lên không hợp lệ",
    "http.unauthenticated": "Đăng nhập để tiếp tục",
    "http.notFound": "Không tìm thấy nội dung bạn cần",
    "http.internalError": "Đã có lỗi xảy ra",
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
    "errors.createUserFailed": "Không thể tạo người dùng. Vui lòng thử lại.",
    "errors.loadRolesFailed": "Không thể tải danh sách vai trò và quyền.",
    "errors.updateRolesFailed": "Không thể lưu phân quyền. Vui lòng thử lại.",
  },
  profile: {
    title: "Hồ sơ",
    "errors.saveFailed": "Không thể lưu hồ sơ. Vui lòng thử lại.",
  },
  permissions: {
    "project.archive": "Lưu trữ dự án",
  },
  permissionGroups: {
    "project.archive": "Dự án",
  },
} as const;
