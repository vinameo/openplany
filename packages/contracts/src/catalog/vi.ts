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
    "language.buttonAriaLabel": "Ngôn ngữ: Tiếng Việt (VI)",
    "test.minute_other": "{{count}} phút",
  },
  auth: {
    signIn: "Đăng nhập",
    "signIn.title": "Đăng nhập vào OpenPlany",
    "signIn.subtitle": "Lập kế hoạch dự án và tài liệu tại cùng một nơi.",
    "signIn.email": "Email",
    "signIn.password": "Mật khẩu",
    "signIn.emailPlaceholder": "name@company.com",
    "signIn.passwordPlaceholder": "Nhập mật khẩu",
    "signIn.hidePassword": "Ẩn mật khẩu",
    "signIn.showPassword": "Hiện mật khẩu",
    "signIn.forgotPassword": "Quên mật khẩu?",
    "signIn.submit": "Đăng nhập",
    "signIn.tryAgainIn": "Thử lại sau {{time}}",
    "signIn.documentTitle": "Đăng nhập · OpenPlany",
    "forgotPassword.title": "Quên mật khẩu?",
    "forgotPassword.body":
      "Tính năng đặt lại mật khẩu qua email chưa khả dụng. Hãy yêu cầu quản trị viên đặt lại mật khẩu cho bạn.",
    "forgotPassword.backToSignIn": "Quay lại đăng nhập",
    "forgotPassword.documentTitle": "Quên mật khẩu · OpenPlany",
    "setPassword.title": "Đặt mật khẩu mới",
    "setPassword.subtitle": "Bạn cần đổi mật khẩu trước khi tiếp tục.",
    "setPassword.body":
      "Tính năng đổi mật khẩu tại đây chưa khả dụng. Hãy yêu cầu quản trị viên đặt lại mật khẩu cho bạn.",
    "setPassword.backToSignIn": "Quay lại đăng nhập",
    "setPassword.documentTitle": "Đặt mật khẩu mới · OpenPlany",
    "errors.signInFailed": "Không thể đăng nhập. Vui lòng thử lại.",
    "errors.invalidEmail": "Nhập email hợp lệ",
    "errors.passwordRequired": "Nhập mật khẩu",
    "errors.passwordTooLong": "Mật khẩu quá dài",
    "errors.invalidCredentials": "Email hoặc mật khẩu không chính xác",
    "errors.accountDeactivated":
      "Tài khoản của bạn đã vô hiệu hoá. Liên hệ quản trị viên.",
    "errors.ssoRequired": "Đăng nhập bằng SSO của tổ chức bạn",
    "errors.tooManyAttempts_other":
      "Quá nhiều lần thử. Tạm khoá trong {{count}} phút.",
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
