# Web spec: Popup chỉnh sửa Profile

- **Dựa trên:**
  - [`profile-draft-ui.png`](./profile-draft-ui.png) (draft, chụp ở tỉ lệ 2×; số đo dưới đây đã quy về 1×)
  - [`profile-analysis.md`](./profile-analysis.md): luật, câu hỏi Q1–Q8
  - [`api-spec.md`](./api-spec.md): endpoint, mã lỗi, câu hỏi A6–A8
  - Code hiện có: `HomePage.tsx` (head bar), `AuthProvider.tsx`, `authApi.ts`, `RequireAuth.tsx`
- **Trạng thái:** bản nháp, viết theo các đề xuất mặc định của Q1–Q8. Chưa dựng.
- **Stack:** React 19, Mantine 9, CSS Modules, theme ở `@repo/ui`. Dùng `@mantine/form` và `@mantine/notifications`: **cả hai đã có trong `package.json`** của web nhưng chưa dùng, nên không phải dependency mới.

---

## 1. Thành phần và vị trí file

| File | Vai trò | Trạng thái |
| --- | --- | --- |
| `features/layout/AppLayout.tsx` | Khung chung cho mọi route đã đăng nhập: `AppHeader` + `<Outlet />` | Mới |
| `features/layout/AppHeader.tsx` + `.module.css` | Head bar: logo, `UserButton`, nút Sign out. **Chuyển từ** `HomePage.tsx` sang | Mới (tách ra) |
| `features/profile/UserButton.tsx` | Avatar + tên, là một nút bấm; giữ trạng thái mở/đóng popup | Mới |
| `features/profile/ProfileModal.tsx` + `.module.css` | Popup: phần đầu (avatar, tên, email), `ProfileForm`, xác nhận bỏ thay đổi | Mới |
| `features/profile/ProfileForm.tsx` | Form 4 ô + nút Save. Không biết mình nằm trong popup, để dùng lại cho trang `/settings/profile` (Q2) | Mới |
| `features/profile/useProfileForm.ts` | `useForm` của `@mantine/form`: giá trị ban đầu, luật kiểm tra, tính các trường đã đổi, gửi API, map lỗi | Mới |
| `features/profile/api/profileApi.ts` | `updateMe(changes)`, `getMe()` | Mới |
| `lib/apiClient.ts` | Hàm `request()` và `ApiRequestError`, **chuyển từ** `authApi.ts` để feature khác dùng chung | Tách ra |
| `features/auth/authContext.ts`, `AuthProvider.tsx` | Thêm `updateUser(user)` và `expireSession()` (mục 6) | Sửa |
| `routes.tsx` | Gắn `AppLayout` làm route cha của `HomePage`, dưới `RequireAuth` | Sửa |
| `main.tsx` | Gắn `<Notifications />` và `import '@mantine/notifications/styles.css'` | Sửa |

```text
RequireAuth
└─ AppLayout
   ├─ AppHeader
   │  ├─ logo
   │  ├─ UserButton ──► ProfileModal ──► ProfileForm
   │  └─ Sign out
   └─ <Outlet />  (HomePage, sau này: issues, projects…)
```

## 2. Head bar: `UserButton`

```text
┌──────────────────────────────────────────────────────────────────────┐
│ [logo 32]                              [ (K) Kai Tran ▾ ]  [Sign out] │  64px
└──────────────────────────────────────────────────────────────────────┘
                                          └──── một <button> ────┘
```

| Phần | Giá trị |
| --- | --- |
| Phần tử | `UnstyledButton` của Mantine, chứa `Avatar` (size `sm`, 26px, `radius="xl"`) + `Text` 14px / 500. Không có icon ▾ (Q6: mở thẳng popup, không mở menu) |
| Vùng bấm | Cao 36px, padding `4px 10px 4px 4px`, bo góc `xl` (tròn hai đầu) |
| Hover | Nền `gray-1` |
| Focus bàn phím | Vòng focus mặc định của Mantine (`:focus-visible`) |
| Tên hiển thị | `displayName`, rỗng thì `email` (Q5). Dài thì cắt bằng `…`, tối đa 200px |
| Avatar | `avatarUrl`, không có thì chữ cái đầu của tên hiển thị (như hiện tại) |
| ARIA | `aria-haspopup="dialog"`, `aria-label="Edit profile – {tên}"` |

## 3. Popup `ProfileModal`

### 3.1 Bố cục (≥ 760px)

```text
┌──────────────────────────── Modal 840px ─────────────────────────────┐
│ Profile                                                          [✕] │  header
│──────────────────────────────────────────────────────────────────────│
│ ┌──────┐                                                             │
│ │ (👤) │  64×64, nền gray-1, bo 8px                                  │
│ └──────┘                                                   24px      │
│ Kai Tran                                   20px / 500               │
│ kaitranpo@gmail.com                        14px, màu muted           │
│                                                            32px      │
│ First name *          Last name             Display name *           │
│ [ Kai              ]  [ Tran             ]  [ kaitranpo          ]   │  36px
│                                                            16px      │
│ Email                                                                │
│ [ kaitranpo@gmail.com ]  (nền xám, chỉ đọc)                          │
│                                                            24px      │
│ [ Save changes ]                                                     │
└──────────────────────────────────────────────────────────────────────┘
```

| Phần | Giá trị |
| --- | --- |
| Modal | `size={840}`, `radius="lg"`, `padding="xl"` (32px), `centered`. Tiêu đề "Profile" 16px / 600, làm `aria-labelledby` cho dialog |
| Cover | **Không hiển thị** ở MVP (Q1). Nút "Change cover" bỏ hẳn, không để ở trạng thái khoá |
| Avatar | 64×64, nền `gray-1`, bo góc 8px. Có ảnh thì hiện ảnh, không thì icon người màu `gray-7`, giống draft. Web **chưa có thư viện icon**: dùng placeholder mặc định của Mantine `Avatar` (đã là icon người), hoặc một SVG inline. Không thêm `@tabler/icons-react` chỉ vì icon này. Không bấm được (Q1) |
| Họ tên lớn | `firstName + " " + lastName`, bỏ khoảng trắng thừa. Cả hai rỗng thì dùng tên hiển thị như head bar. **Cập nhật theo ô đang gõ**, để người dùng thấy ngay kết quả (ví dụ lỗi lặp "Kai Tran Tran" trong draft) |
| Lưới ô | `SimpleGrid type="container"`, `cols={{ base: 1, '560px': 2, '760px': 3 }}`, `spacing="lg"` (24px ngang), `verticalSpacing="md"` (16px dọc). Dùng container query vì độ rộng của modal, không phải của viewport, mới quyết định số cột |
| Email | Hàng riêng, chiếm 1 cột. `readOnly` + `variant="filled"` (nền xám như draft). **Không** dùng `disabled`: ô disabled có chữ mờ dưới mức tương phản, không focus được và không chọn để copy được. **Không có dấu `*`** |
| Nút Save | `Button` mặc định của theme (cao 36px), căn trái như draft. Không có nút Cancel: đóng bằng ✕, Esc hoặc bấm ra ngoài (V5) |

### 3.2 Màn hẹp (< 576px)

- `fullScreen` (dùng `useMediaQuery('(max-width: 575px)')`), không bo góc, `transitionProps={{ transition: 'slide-up' }}`.
- Các ô xếp một cột (container query tự xử lý).
- Nút Save rộng hết màn, dính dưới đáy (`position: sticky; bottom: 0`) để không bị bàn phím ảo che.
- Ô nhập dùng chữ 16px để Safari iOS không tự zoom (giống màn đăng nhập).

## 4. Màu và chữ

| Vai | Giá trị | Ghi chú |
| --- | --- | --- |
| Chữ chính, nhãn | `--mantine-color-text` | |
| Email dưới họ tên | `#707070` (`--login-muted` của màn đăng nhập, tương phản 4.9:1) | Nên đưa biến này thành token chung trong `@repo/ui` (V6) |
| Dấu `*` | `red-8` | Như màn đăng nhập |
| Nền ô Email | `variant="filled"` của Mantine (`gray-1`) | |
| Nút Save | `primary` của theme (`brand`, shade 7 = `#2c5fe6`) | Draft dùng xanh đậm hơn (khoảng `#0b5f9a`). **Giữ màu theme**, không làm màu riêng cho popup |

Không có dark mode (`AppUiProvider` khoá `light`).

## 5. Nội dung chữ

| Chỗ | Chữ |
| --- | --- |
| Tiêu đề popup | `Profile` |
| Nhãn / placeholder | `First name` / `Given name` · `Last name` / `Family name` · `Display name` / `How others see you` · `Email` |
| Gợi ý dưới ô Email | `Contact your admin to change your email.` (`description` của Mantine, 12px) |
| Nút | `Save changes`; khi đang lưu: vòng xoay (`loading`), không đổi chữ |
| Toast thành công | `Profile updated` (màu xanh lá, tự đóng sau 3 giây) |
| Xác nhận bỏ thay đổi | `Discard unsaved changes?` · nút `Keep editing` / `Discard` |
| Lỗi theo ô | Nguyên văn `fields[...]` từ API (api-spec, mục 3.2). Client dùng **đúng các câu đó** cho kiểm tra phía client |
| Lỗi chung | `message` từ API. Mất mạng hoặc body không đọc được: `Couldn't save your profile. Please try again.` |

## 6. Dữ liệu và trạng thái

### 6.1 Nguồn dữ liệu

- Giá trị ban đầu của form lấy từ `state.session.user` trong `AuthContext`, **chụp lại lúc mở popup**. Đang mở mà context đổi thì form không bị ghi đè.
- Lưu thành công: gọi `updateUser(body)` để thay `session.user` bằng response. Head bar và `HomePage` tự cập nhật.
- Không copy user sang state riêng ngoài form. Khi thêm TanStack Query (cần hỏi trước), `updateUser` đổi thành cập nhật cache, giao diện của popup giữ nguyên.

Thay đổi `AuthContextValue`:

```ts
export interface AuthContextValue {
  state: AuthState;
  signIn: (values: SignInRequest) => Promise<AuthSession>;
  signOut: () => Promise<void>;
  /** Thay user của phiên hiện tại bằng dữ liệu mới từ server. */
  updateUser: (user: AuthUser) => void;
  /** Server báo 401: quên phiên ở client, RequireAuth sẽ chuyển về /sign-in. */
  expireSession: () => void;
}
```

### 6.2 Kiểm tra phía client

Lặp lại luật của API để báo lỗi sớm; server vẫn là nguồn chuẩn.

- Kiểm tra khi rời ô (`validateInputOnBlur`) và khi bấm Save. Không báo lỗi khi đang gõ dở.
- So sánh sau khi `trim()` + `normalize('NFC')`, giống hệt server. Vì vậy `"Kai "` coi như **không đổi** so với `"Kai"`.
- Chỉ gửi trường đã đổi (so với giá trị ban đầu sau chuẩn hoá).

### 6.3 Bảng trạng thái

| Trạng thái | Hiển thị |
| --- | --- |
| Vừa mở | Focus vào ô First name (`data-autofocus`). Nút Save **khoá** |
| Người dùng cũ, First name trống | Ô First name trống, chưa báo lỗi. Bấm Save mà vẫn trống thì báo "Enter your first name" |
| Đã đổi ít nhất một ô | Nút Save mở |
| Sửa rồi gõ lại đúng giá trị cũ | Nút Save khoá lại (form không còn "dirty") |
| Ô sai | Lỗi đỏ dưới ô (`error` của Mantine, `aria-invalid`). Nút Save **vẫn mở**: bấm thì focus vào ô lỗi đầu tiên |
| Đang lưu | Nút `loading`, các ô `readOnly`, không đóng được popup (`closeOnEscape`, `closeOnClickOutside`, nút ✕ đều tắt) |
| `200` | `updateUser`, đóng popup, toast "Profile updated" |
| `400 VALIDATION_ERROR` có `fields` | Gắn lỗi vào đúng ô, focus ô lỗi đầu tiên |
| `400` không có `fields` ("Nothing to update") | Không xảy ra vì nút Save khoá khi không có gì đổi. Nếu có thì hiện `Alert` chung |
| `401` | `expireSession()`, popup đóng theo, `RequireAuth` chuyển về `/sign-in`. **Mất dữ liệu đang gõ**: chấp nhận, vì phiên hết hạn trong lúc mở popup là hiếm |
| `403` / `5xx` / mất mạng | `Alert` màu đỏ phía trên nút Save (`role="alert"`), giữ nguyên dữ liệu |
| Đóng khi có thay đổi chưa lưu | Không đóng ngay. Hiện thanh xác nhận **bên trong popup**, thay vị trí nút Save: "Discard unsaved changes?" + `Keep editing` (focus mặc định) / `Discard`. Không mở modal thứ hai chồng lên |
| Đóng khi không có thay đổi | Đóng ngay. Mở lại thì form lấy lại dữ liệu mới nhất từ context |

## 7. Bàn phím và trợ năng

- Mở: Enter hoặc Space trên `UserButton`. Đóng: Esc (trừ khi đang lưu). Đóng xong focus trở về `UserButton` (Mantine `returnFocus`, bật sẵn).
- Focus bị giữ trong popup (`trapFocus`, bật sẵn). Thứ tự Tab: ✕ → First name → Last name → Display name → Email → Save.
- Nhấn Enter trong bất kỳ ô nào là gửi form (`<form onSubmit>`, `noValidate`).
- Ô Email `readOnly` vẫn focus và đọc được bằng screen reader; gợi ý "Contact your admin…" gắn qua `aria-describedby` (Mantine tự gắn với `description`).
- Ô bắt buộc có `required` (`withAsterisk`); dấu `*` chỉ để nhìn.
- `autoComplete`: `given-name`, `family-name`, `nickname`, `email`.
- Toast của `@mantine/notifications` dùng `role="alert"`, nên screen reader đọc được.

## 8. Việc cần làm

| # | Việc | Phụ thuộc |
| --- | --- | --- |
| W7 | Tách `request()`/`ApiRequestError` sang `lib/apiClient.ts`; đổi message mặc định thành tham số | — |
| W8 | Tách `AppHeader` + `AppLayout` khỏi `HomePage`, sửa `routes.tsx` | — |
| W9 | Thêm `updateUser`, `expireSession` vào `AuthProvider` | — |
| W10 | Gắn `<Notifications />` vào `main.tsx` | — |
| W11 | `profileApi`, `useProfileForm`, `ProfileForm`, `ProfileModal`, `UserButton` | W7–W10, API `PATCH /api/users/me` |
| W12 | Cập nhật `authTypes.ts`: thêm `UpdateProfileRequest` | Chuyển sang `@repo/contracts` khi package này có (W6 của login) |

## 9. Quyết định thiết kế cần chốt

**V5. Nút Cancel.** Draft chỉ có "Save changes". Đề xuất giữ đúng draft: ✕ và Esc là đủ, ít nút thì người dùng ít phải nghĩ. Nếu thấy người dùng không tìm được cách đóng thì thêm `Cancel` (variant `default`) bên phải nút Save.

**V6. Token màu chữ phụ.** `#707070` đang là biến cục bộ `--login-muted` của màn đăng nhập. Popup cần đúng màu này. Đề xuất đưa vào `@repo/ui` thành biến dùng chung (ví dụ `--app-color-muted`), thay vì khai báo lại.

**V7. Ba cột hay hai cột.** Draft xếp 3 ô trên một hàng. Trong popup 840px, mỗi ô còn khoảng 245px: đủ cho tên, nhưng chật nếu sau này thêm ô múi giờ (Q4). Đề xuất giữ 3 cột theo draft; khi thêm ô mới thì xét lại.

## 10. Kiểm thử (Vitest + React Testing Library)

Mọi test bọc trong `<AppUiProvider>` và một `AuthContext` giả (`test/authFixtures.ts`); gọi API qua `test/fetchMock.ts` có sẵn.

| File | Ca |
| --- | --- |
| `UserButton.test.tsx` | Là `button` có tên truy cập được. Bấm (và Enter) thì mở dialog tên "Profile". Hiện email khi `displayName` rỗng |
| `ProfileForm.test.tsx` | Giá trị ban đầu đúng. Save khoá khi chưa đổi. Gõ lại giá trị cũ thì khoá lại. Chỉ gửi trường đã đổi (kiểm tra body của `fetch`). First name toàn khoảng trắng → lỗi, không gọi `fetch`. `400` có `fields` → lỗi dưới đúng ô. Mất mạng → `Alert`, giữ dữ liệu |
| `ProfileModal.test.tsx` | `200` → popup đóng, toast hiện, `updateUser` được gọi với response. Esc khi có thay đổi → hiện "Discard unsaved changes?"; `Keep editing` giữ dữ liệu; `Discard` đóng. Đang lưu thì Esc không đóng. `401` → gọi `expireSession` |
| `routes.test.tsx` (sửa) | Route đã đăng nhập có head bar với `UserButton` |
