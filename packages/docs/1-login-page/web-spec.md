# Web spec: Giao diện đăng nhập

- **Dựa trên:**
  - [`login-draft-ui.png`](./login-draft-ui.png) (draft)
  - [`login-analysis.md`](./login-analysis.md): các luật, câu hỏi Q1–Q8
  - [`api-spec.md`](./api-spec.md): endpoint, mã lỗi, câu hỏi A1–A5
  - Bản dựng hiện tại: `apps/web/src/features/auth/LoginPage.tsx` và `LoginPage.module.css`
- **Trạng thái:** bản nháp. Mục 1–7 mô tả **đúng bản đã dựng** (số đo lấy từ code). Mục 8 liệt kê phần còn thiếu so với `api-spec.md`. Mục 9 là các quyết định thiết kế cần chốt.
- **Stack:** React 19, Vite, Mantine 9, CSS Modules, theme dùng chung ở `@repo/ui`. Không dùng Tailwind.

---

## 1. Màn hình và route

| Route | Màn | Trạng thái |
| --- | --- | --- |
| `/sign-in` | Đăng nhập | **Đã dựng.** Đang render trực tiếp trong `App.tsx` vì web chưa có router |
| `/set-password` | Đặt mật khẩu mới, dùng cho phiên `requiresPasswordReset` | Chưa dựng |
| `/forgot-password` | Nhập email để nhận link đặt lại | Chưa dựng. Link "Forgot password?" đã trỏ tới đây |
| `/reset-password?token=…` | Đặt mật khẩu mới từ link trong email | Chưa dựng |

Cả 4 màn dùng **chung một khung** (mục 2), chỉ khác phần nội dung bên trong card. Nên tách khung này ra thành component `AuthLayout`.

## 2. Bố cục `/sign-in`

```text
┌──────────────────── nền trang: gray-0 ──────────────────────┐
│                                                              │
│            ┌──────── card trắng, max 448px ────────┐         │
│            │ [logo 48×48]                          │         │
│            │                                24px   │         │
│            │ Sign in to OpenPlany          (h1)    │         │
│            │ Configure instance-wide…  (dòng phụ)  │         │
│            │                                32px   │         │
│            │ Email *                               │         │
│            │ [ name@company.com                  ] │  48px   │
│            │                                20px   │         │
│            │ Password *          Forgot password?  │         │
│            │ [ Enter your password            👁  ] │  48px   │
│            │ (câu lỗi chung, chỉ hiện khi có lỗi)   │         │
│            │                             20 + 8px  │         │
│            │ [            Sign in                 ] │  48px   │
│            └───────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────┘
```

| Phần | Giá trị |
| --- | --- |
| Trang | `min-height: 100svh`, card căn giữa cả hai chiều, padding `48px 16px` |
| Card | `max-width: 448px`, padding `40px` (dưới 480px: `32px 20px`), bo góc `16px`, nền trắng. **Không viền, không bóng**: trang chỉ có một card, chênh lệch màu nền đã đủ tách |
| Logo | Dấu hình hộp, cắt từ `openplany-logo.png` ra `openplany-mark.png` (192px, nền trong suốt), hiển thị 48×48, cách tiêu đề 24px. Không dùng logo đầy đủ: tagline sẽ chỉ còn khoảng 8px |
| Tiêu đề `h1` | 20px / 600 / line-height 1.4 |
| Dòng phụ | 16px / 500 / line-height 1.5, màu `--login-muted`, `text-wrap: pretty` |
| Form | Cột dọc, `gap: 20px`, cách khối tiêu đề 32px |
| Nhãn | 14px / 500 / line-height 20px, cách ô 6px. Dấu `*` dùng `red-8` |
| Ô nhập | Cao 48px, bo góc 12px, padding ngang 16px, viền `gray-3`. Cỡ chữ 16px (dưới 768px, để Safari iOS không tự zoom) và 14px từ 768px trở lên |
| Nút mắt | Vùng bấm 32×32, bo góc 8px, màu `--login-muted`. Rê chuột vào thì nền `gray-1` |
| "Forgot password?" | Nằm cùng hàng với nhãn Password, căn phải. 14px / 400, màu chữ chính (không làm nhạt). Vùng bấm nới lên khoảng 32px bằng `::before` |
| Nút "Sign in" | Rộng hết card, cao 48px, bo góc 12px, chữ 15px / 500, màu `primary` của theme (`brand-6 #3f70ff`). Cách ô phía trên 28px |

## 3. Màu và chữ

| Vai | Giá trị | Tương phản trên nền trắng |
| --- | --- | --- |
| Nền trang | `--mantine-color-gray-0` (`#f8f9fa`) | — |
| Chữ chính | `--mantine-color-text` | ≥ 12:1 |
| Chữ phụ, placeholder, icon mắt | `--login-muted: #707070`. Màu `dimmed` của Mantine chỉ đạt 3.3:1 nên không dùng | 4.9:1 |
| Viền ô | `--mantine-color-gray-3` | — |
| Focus ô | Viền `primary` + vầng sáng 2px màu `primary` độ đậm 15% | — |
| Lỗi, dấu `*` | `--mantine-color-red-8` | ≥ 4.5:1 |
| Nút chính | Nền `primary`, chữ trắng | **4.2:1: chưa đạt 4.5:1** cho chữ 15px (xem V1) |
| Nút bị khoá | Màu disabled mặc định của Mantine (nền xám, chữ xám), khớp draft | — |

- Font là **Inter**, khai báo trong `packages/ui/src/theme.ts`. Đổi font hoặc màu nhấn chỉ cần sửa ở file đó.
- **Không có dark mode.** `AppUiProvider` đang khoá `defaultColorScheme="light"`.

## 4. Nội dung chữ

UI dùng tiếng Anh, theo draft và `lang="en"`.

| Chỗ | Chữ |
| --- | --- |
| Tab trình duyệt | `Sign in · OpenPlany` |
| Tiêu đề | `Sign in to OpenPlany` (draft bị cắt mất tiêu đề, chữ này mình đặt) |
| Dòng phụ | `Configure instance-wide settings to secure your instance`, giữ đúng chữ trong draft. **Chờ Q1**: đây là câu của màn quản trị, không hợp với màn đăng nhập của người dùng thường |
| Nhãn / placeholder | `Email` / `name@company.com`; `Password` / `Enter your password` |
| Link | `Forgot password?` |
| Nút | `Sign in` |
| Lỗi | Hiển thị nguyên văn `message` mà API trả về (bảng lỗi ở `api-spec.md`, mục 3.1). Lỗi không đọc được (mất mạng, body không phải JSON) thì hiện `Couldn't sign in. Please try again.` |

## 5. Trạng thái

| Trạng thái | Hiển thị | Đã có |
| --- | --- | --- |
| Mới mở trang | Con trỏ nằm sẵn ở ô Email (`autoFocus`). Nút **khoá** | ✅ |
| Đã điền cả hai ô | Nút chuyển sang màu `primary`, bấm được. Email chỉ toàn khoảng trắng vẫn tính là trống | ✅ |
| Ô đang focus | Viền `primary` + vầng sáng 2px | ✅ |
| Đang gửi | Nút hiện vòng xoay của Mantine (`loading`). Không gửi lần hai | ✅ |
| Lỗi `401` / `403` | Câu lỗi màu đỏ phía trên nút, `role="alert"`. **Cần thêm:** giữ email, **xoá ô mật khẩu và đưa con trỏ về ô đó** | Một phần |
| Lỗi `429` | Câu lỗi kèm số phút. **Cần thêm:** khoá nút và đếm ngược theo `retryAfterSeconds`, hết giờ thì mở lại | ❌ |
| Lỗi `400 VALIDATION_ERROR` | **Cần thêm:** câu lỗi hiện dưới đúng ô (prop `error` của Mantine), không gộp vào câu lỗi chung | ❌ |
| Đang kiểm tra phiên khi mở trang | Chỉ hiện nền trang, chưa hiện card. Quá 300ms thì hiện form. Đã có phiên thì chuyển thẳng vào app, không để form nháy lên rồi biến mất | ❌ |
| Mất mạng | Câu lỗi chung, giữ nguyên dữ liệu đã nhập | ✅ (qua `catch`) |

## 6. Hành vi và bàn phím

- **Thứ tự Tab:** Email → Password → nút mắt → "Forgot password?" → Sign in. Trong DOM, link nằm **sau** ô mật khẩu và được đặt `position: absolute` lên hàng nhãn. Nhờ vậy gõ email xong bấm Tab là vào ô mật khẩu, không rơi vào link.
- Nhấn Enter ở bất kỳ ô nào là gửi form (`<form onSubmit>`). Form có `noValidate` để trình duyệt không hiện bong bóng kiểm tra của nó.
- Email được `trim()` trước khi gửi. Server tự chuyển chữ thường.
- `autoComplete="email"` và `"current-password"` giúp trình quản lý mật khẩu điền đúng ô.
- Không có checkbox "Remember me". Phiên đăng nhập do server tự gia hạn (`api-spec.md`, mục 3.2).
- Link "Forgot password?" nên mang email đang gõ sang màn `/forgot-password` (qua state của router) để người dùng khỏi gõ lại.

## 7. Responsive và trợ năng

- Đã chạy probe ở 375px, 1440px, 1920px, và kéo bề rộng từ 1440 xuống 375px theo bước 20px: không cuộn ngang, không chữ xuống dòng trong nút, không có phần tử chồng nhau.
- Mọi vùng bấm ≥ 32px. Mọi chữ đạt tương phản ≥ 4.5:1, **trừ chữ trắng trên nút xanh** (4.2:1). Probe không bắt được lỗi này vì lúc đo nút đang ở trạng thái khoá. Cách sửa nằm ở V1.
- Nhãn gắn đúng với ô (Mantine tự gắn `id` và `htmlFor`). Ô bắt buộc có `required`. Dấu `*` chỉ để nhìn.
- Câu lỗi có `role="alert"`, nên trình đọc màn hình tự đọc khi lỗi xuất hiện.
- Link không có vòng focus; khi focus bằng bàn phím thì gạch chân. Ô nhập có viền và vầng sáng khi focus.
- Hiệu ứng duy nhất là `transition` 150ms trên viền ô. Chưa cần xử lý riêng cho người bật `prefers-reduced-motion`.

## 8. Còn thiếu so với `api-spec.md`

| # | Việc | Phụ thuộc |
| --- | --- | --- |
| W1 | Thêm router, khung `AuthLayout` và 4 route ở mục 1 | A2: `react-router`, dependency mới |
| W2 | Hàm `signIn` gọi `POST /api/auth/sign-in` rồi truyền vào prop `onSubmit` (code mẫu ở `api-spec.md`, mục 7) | — |
| W3 | Kiểm tra phiên khi mở trang (`GET /api/auth/session`) và chuyển hướng (mục 5) | W1 |
| W4 | Lỗi hiện dưới từng ô (`fields`), đếm ngược khi bị `429`, xoá ô mật khẩu khi bị `401` | Đổi kiểu reject của `onSubmit` từ `Error` sang một lỗi có `code`, `fields`, `retryAfterSeconds` |
| W5 | Dựng 3 màn `/set-password`, `/forgot-password`, `/reset-password` | W1 |
| W6 | Kiểu `ApiError` và `AuthSessionResponse` dùng chung với API | Package `@repo/contracts` (Zod), chưa tạo |

## 9. Quyết định thiết kế cần chốt

**V1. Màu nhấn đang lệch với logo.**

- Logo dùng navy `#141B2B` và vàng `#F4C00E`, trong khi `primary` của theme là xanh `#3F70FF`. Nút xanh đứng ngay dưới logo vàng nên trông như hai bộ nhận diện khác nhau.
- Ngoài ra, chữ trắng trên nền xanh này chỉ đạt 4.2:1, chưa đạt chuẩn WCAG AA.

| Hướng | Mô tả | Đánh đổi |
| --- | --- | --- |
| **a. Giữ xanh** (hiện tại) | Chỉ hạ `primaryShade` từ 6 xuống 7 (`#2c5fe6`) để đạt chuẩn tương phản | Vẫn lệch với logo |
| **b. Navy làm màu chính** (đề xuất) | Nút chính nền navy `#141B2B`, chữ trắng (17:1). Vàng chỉ dùng làm điểm nhấn nhỏ: chấm báo, vạch dưới tab đang chọn, viền focus | Đổi màu trên **toàn app**, vì phải sửa `packages/ui/src/theme.ts` |
| **c. Vàng làm màu chính** | Nút nền vàng, chữ navy (khoảng 10:1) | Vàng **không dùng được làm màu chữ hay link** trên nền trắng (chỉ 1.7:1), nên lại cần thêm một màu thứ hai cho link |

**V2. Dòng phụ:** sửa theo đáp án Q1. Nếu màn này dành cho người dùng thường, đề xuất bỏ hẳn dòng phụ, hoặc dùng câu ngắn `Plan projects and docs in one place.`

**V3. Font:** giữ Inter cho cả app, vì đây là màn nằm trong một ứng dụng làm việc, cần đồng bộ với các màn khác. Muốn màn đăng nhập có cá tính riêng thì chỉ đổi font của **tiêu đề**, và nên làm cùng lúc với V1.

**V4. Dark mode:** chưa làm. Nếu làm thì làm cho cả `@repo/ui`, không làm riêng cho màn này.

## 10. Kiểm thử (Vitest + React Testing Library)

Đã có trong `LoginPage.test.tsx`:

- Nút bị khoá cho tới khi điền đủ hai ô.
- Gửi email đã được trim.
- Hiện message khi `onSubmit` reject.
- Link quên mật khẩu trỏ đúng `/forgot-password`.

Cần thêm khi làm W2–W4:

- Lỗi `401`: ô mật khẩu bị xoá và nhận focus.
- Lỗi `429`: nút bị khoá trong lúc đếm ngược, hết giờ thì mở lại.
- `VALIDATION_ERROR`: câu lỗi hiện dưới đúng ô.
- Đã có phiên: không render form và chuyển vào app.
- Thứ tự Tab: Email → Password → nút mắt → link.
