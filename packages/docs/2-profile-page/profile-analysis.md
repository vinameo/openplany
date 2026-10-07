# Phân tích nghiệp vụ: Popup chỉnh sửa Profile

- **Nguồn:** `profile-draft-ui.png` (draft UI), bảng `users` hiện có (migration `CreateAuthTables`) và code đăng nhập đã làm ở `1-login-page`.
- **Trạng thái:** bản nháp, chờ chốt các câu hỏi ở mục 10.
- **Phạm vi:** người dùng đã đăng nhập bấm vào avatar + tên ở head bar, mở popup, xem và sửa thông tin cá nhân của **chính mình**. Không bao gồm: đổi email, đổi mật khẩu, quản trị viên sửa profile người khác, trang profile công khai.

---

## 1. Mục tiêu và tiêu chí thành công

| Mục tiêu | Tiêu chí đo |
| --- | --- |
| Người dùng tự sửa được tên hiển thị mà không cần nhờ admin | Từ lúc bấm vào tên tới lúc lưu xong ≤ 3 thao tác. API `PATCH` phản hồi < 300 ms (p95) |
| Thay đổi thấy ngay, không cần tải lại trang | Sau khi lưu, tên ở head bar đổi ngay trong cùng phiên |
| Không ai sửa được profile của người khác | Endpoint không nhận `userId` từ client. Có e2e test chứng minh |
| Không mất dữ liệu đang gõ dở | Đóng popup khi có thay đổi chưa lưu thì hỏi xác nhận |

## 2. Đọc draft UI

| Phần tử | Ghi chú nghiệp vụ |
| --- | --- |
| Ô avatar (icon người mặc định) | Draft không có nút đổi avatar. Hiển thị `avatar` hoặc chữ cái đầu như head bar. Có cho upload không: Q1 |
| Nút "Change cover" | Map vào `cover_image` / `cover_image_asset_id`. **Draft không vẽ vùng ảnh bìa** nên chưa rõ ảnh bìa hiện ở đâu. Hệ thống **chưa có lưu trữ file** (mục 6). Q1 |
| Tiêu đề "Kai Tran Tran" | Là `first_name + " " + last_name`. Ví dụ trong draft cho thấy người dùng dễ gõ cả họ tên vào First name, làm tên bị lặp. Chỉ là dữ liệu mẫu, nhưng nên có placeholder gợi ý ("Given name") |
| Dòng email dưới tiêu đề | Chỉ đọc |
| First name `*` | Bắt buộc. Map `first_name` |
| Last name | Không bắt buộc. Map `last_name` |
| Display name `*` | Bắt buộc. Map `display_name`. Giá trị mẫu "kaitranpo" giống một handle hơn là tên. Có cần unique không: Q3 |
| Email `*` (nền xám) | Nền xám nghĩa là **chỉ đọc**. Dấu `*` trên ô chỉ đọc gây hiểu lầm, nên bỏ. Đổi email là luồng riêng, cần xác minh lại (ngoài phạm vi) |
| Nút "Save changes" | Khoá khi form chưa thay đổi hoặc đang lưu. Không thấy nút Cancel/đóng: popup cần nút X và đóng bằng Esc |
| Không có `user_timezone`, `mobile_number` | Cột có sẵn nhưng draft không có. Có thêm múi giờ không: Q4 |

Draft là bố cục trang rộng, 3 cột. Trong popup cần: Mantine `Modal` size `lg`; trên màn hẹp (< 768px) chuyển sang một cột và `fullScreen`.

## 3. Điểm vào: head bar

Hiện tại avatar + tên nằm trong [HomePage.tsx](../../../apps/web/src/features/home/HomePage.tsx) dưới dạng `Avatar` + `Text` tĩnh, không bấm được.

| Yêu cầu | Lý do |
| --- | --- |
| Gói avatar + tên vào **một** phần tử `button` (Mantine `UnstyledButton`), có `aria-haspopup="dialog"` | Bấm được bằng bàn phím, đọc được bằng screen reader. Không gắn `onClick` lên `div` |
| Tách head bar ra component riêng (`AppHeader`) dùng chung cho mọi trang đã đăng nhập | Các trang sau (issues, projects) cũng cần mở được popup |
| Khi popup đóng, trả focus về nút trên head bar | Mantine `Modal` làm sẵn khi `returnFocus` bật |
| Nút "Sign out" giữ nguyên chỗ cũ | Nếu sau này muốn gom vào menu (Profile / Sign out) thì đổi thành `Menu`. Q6 |

Tên trên head bar: hiện là `displayName`, nếu rỗng thì `email`. Giữ nguyên luật này (Q5).

## 4. Cột liên quan

| Cột | Đọc | Ghi | Ghi chú |
| --- | --- | --- | --- |
| `first_name` | ✔ | ✔ | `varchar(255)`, mặc định `''` |
| `last_name` | ✔ | ✔ | Cho phép rỗng |
| `display_name` | ✔ | ✔ | |
| `email` | ✔ | ✘ | Chỉ đọc |
| `avatar`, `avatar_asset_id` | ✔ | Q1 | Hiện chỉ có URL dạng text, chưa có bảng tệp |
| `cover_image`, `cover_image_asset_id` | ✔ | Q1 | Entity `User` **chưa map** hai cột này |
| `user_timezone` | ✔ | Q4 | Đã trả về trong session |
| `updated_at` | | ✔ | Ứng dụng tự ghi (không có trigger) |
| `is_managed` | ✔ | ✘ | Có thể khoá sửa tên nếu tên đồng bộ từ SSO (Q7) |

## 5. Luật nghiệp vụ

### 5.1 Kiểm tra dữ liệu (server, DTO class-validator)

Mọi chuỗi được **trim** trước khi kiểm tra. Client kiểm tra giống hệt để báo lỗi sớm, nhưng server là nguồn chuẩn.

| Trường | Luật | Câu lỗi |
| --- | --- | --- |
| `firstName` | Bắt buộc, 1–50 ký tự sau trim | "Enter your first name" / "First name must be 50 characters or fewer" |
| `lastName` | Không bắt buộc, 0–50 ký tự | "Last name must be 50 characters or fewer" |
| `displayName` | Bắt buộc, 1–50 ký tự. Unique hay không: Q3 | "Enter a display name" / "This display name is taken" |
| Cả ba | Không chứa ký tự điều khiển (`\u0000–\u001F`, `\u007F`) hay ký tự vô hình (zero-width) | "Contains characters that aren't allowed" |
| `email` và mọi trường khác | Không được gửi lên. `forbidNonWhitelisted` trả `400` | — |

Giới hạn 50 ký tự là đề xuất cho UI gọn; cột DB vẫn là 255 nên đổi sau không cần migration. HTML/emoji được phép vì React đã escape khi render.

### 5.2 Quyền và trạng thái tài khoản

| # | Điều kiện | Kết quả |
| --- | --- | --- |
| 1 | Không có phiên hợp lệ | `401` |
| 2 | Phiên của tài khoản `is_active = false` hoặc `masked_at` khác null | `401` (phiên đã bị huỷ ở bước kiểm tra phiên) |
| 3 | Phiên ở trạng thái `requiresPasswordReset` | `403`. Phải đổi mật khẩu trước |
| 4 | `is_managed = true` và tên do SSO quản lý | `403` khi sửa tên (Q7) |
| 5 | Request có `Origin` lạ | `403` (`OriginGuard` toàn cục đã có) |
| 6 | Qua hết | `200`, trả về profile mới |

Endpoint luôn sửa **người dùng của phiên hiện tại** (`/users/me`). Không có tham số `id`, nên không có rủi ro IDOR.

### 5.3 Hành vi popup

- Mở popup: lấy dữ liệu đang có trong `AuthContext` (đã tải lúc kiểm tra phiên), không cần gọi API thêm.
- "Save changes" chỉ gửi **các trường đã đổi** (`PATCH`). Không đổi gì thì nút bị khoá.
- Lưu thành công: cập nhật user trong `AuthContext` từ response, hiện thông báo "Profile updated", đóng popup.
- Lưu lỗi `400`: hiện lỗi dưới từng ô theo `fields` của response. Lỗi khác: hiện `Alert` trong popup, giữ nguyên dữ liệu đang gõ.
- Đóng popup (X, Esc, bấm ra ngoài) khi có thay đổi chưa lưu: hỏi "Discard changes?".
- Khi đang lưu: khoá form và nút đóng để tránh gửi hai lần.

## 6. Khoảng trống hiện tại

| Thiếu | Ảnh hưởng | Đề xuất |
| --- | --- | --- |
| Guard kiểm tra phiên dùng lại được | Logic đọc cookie + `getSession` đang nằm trong `AuthController`. Mọi endpoint mới cần nó | Tách `SessionGuard` + decorator `@CurrentUser()` trong `auth/`, export từ `AuthModule` |
| Module `users/` | `UsersRepository` đang nằm trong `auth/` | Tạo `users/` với `ProfileController` + `ProfileService`; dùng lại repository qua export của `AuthModule` hoặc chuyển repository sang `users/` |
| Cập nhật user trong `AuthContext` | Context chỉ có `signIn`/`signOut` | Thêm `updateUser(user)` (hoặc `refreshSession()`). Về lâu dài nên dùng TanStack Query (dependency mới, phải hỏi trước) |
| Lưu trữ file (avatar, cover) | Không làm được "Change cover" hay upload avatar | Cần quyết định nơi lưu (S3 / MinIO / đĩa cục bộ), bảng `file_assets`, kiểm tra loại file và kích thước. Đây là một tính năng riêng. Đề xuất tách khỏi đợt này (Q1) |
| Entity `User` thiếu `cover_image*`, `avatar_asset_id` | | Map thêm khi làm Q1 |
| Rate limit cho endpoint ghi | CLAUDE.md yêu cầu, chưa có thư viện | Mức rủi ro thấp vì phải đăng nhập. Ghi backlog cùng `@nestjs/throttler` |

Không cần migration cho phạm vi text (first/last/display name). Chỉ cần migration nếu Q3 = unique.

## 7. Hợp đồng API đề xuất

`GET /api/users/me` → `200` trả `AuthUserResponse` (cùng hình với `user` trong session). Không bắt buộc cho MVP vì session đã có dữ liệu, nhưng hữu ích khi mở popup ở tab đã để lâu.

`PATCH /api/users/me`

```jsonc
// Request: mọi trường đều optional, chỉ gửi trường đã đổi
{ "firstName": "Kai", "lastName": "Tran", "displayName": "kaitranpo" }

// 200: cùng hình với AuthUserResponse để web ghi thẳng vào AuthContext
{ "id": "…", "email": "kaitranpo@gmail.com", "firstName": "Kai", "lastName": "Tran",
  "displayName": "kaitranpo", "avatarUrl": null, "timezone": "UTC",
  "isEmailVerified": true, "isInstanceAdmin": false }
```

| Mã | Khi nào |
| --- | --- |
| `400` | DTO sai, body rỗng, hoặc có trường lạ (`email`, `isSuperuser`…). Kèm `fields` |
| `401` | Luật 5.2 #1–2 |
| `403` | Luật 5.2 #3–5 |
| `409` | `displayName` đã có người dùng (chỉ khi Q3 = unique) |

Service ghi `updated_at = now()` trong cùng câu `UPDATE`. Ghi log `profile.updated` kèm `userId`, `requestId` và **tên các trường đã đổi**, không ghi giá trị (PII).

## 8. Tiêu chí nghiệm thu

1. **Given** đã đăng nhập, **when** bấm vào avatar hoặc tên ở head bar (chuột hoặc Enter/Space), **then** popup mở với dữ liệu hiện tại và focus vào ô First name.
2. **Given** popup mở và chưa sửa gì, **then** nút "Save changes" bị khoá.
3. **Given** đổi Display name thành "Kai" và bấm Save, **then** nhận `200`, popup đóng, head bar hiện "Kai" ngay, tải lại trang vẫn là "Kai".
4. **Given** First name chỉ toàn dấu cách, **then** lỗi "Enter your first name" dưới ô, không gửi request (client) và server cũng trả `400` nếu gửi thẳng.
5. **Given** request gửi kèm `"email": "x@y.z"` hoặc `"isSuperuser": true`, **then** `400`, dữ liệu không đổi.
6. **Given** không có cookie phiên, **then** `PATCH /api/users/me` trả `401`.
7. **Given** đã sửa một ô và bấm Esc, **then** hỏi "Discard changes?"; chọn huỷ thì giữ nguyên popup và dữ liệu.
8. **Given** ô Email, **then** không sửa được và không có dấu `*`.
9. **Given** màn hình rộng 375px, **then** popup toàn màn hình, các ô xếp một cột, không cuộn ngang.

## 9. Ngoài phạm vi (backlog)

Đổi email (cần xác minh lại), đổi mật khẩu khi đã đăng nhập, upload avatar/cover (phụ thuộc lưu trữ file), số điện thoại, trang profile công khai, admin sửa profile người khác.

## 10. Câu hỏi cần chốt

| # | Câu hỏi | Đề xuất mặc định |
| --- | --- | --- |
| Q1 | Đợt này có làm upload avatar và "Change cover" không? Ảnh bìa hiển thị ở đâu? | **Không.** Ẩn nút "Change cover", avatar chỉ hiển thị. Làm lưu trữ file thành tính năng riêng |
| Q2 | Popup là cách **duy nhất** để sửa profile, hay sau này còn trang `/settings/profile`? | Popup cho đợt này. Đặt form thành component `ProfileForm` để dùng lại được cho trang sau |
| Q3 | `display_name` có phải duy nhất (dùng để @mention) không? | Chưa unique. Khi làm @mention thì quyết lại và thêm unique index trên `lower(display_name)` |
| Q4 | Có cho chọn múi giờ trong popup không? | Không ở đợt này; giữ `UTC`/giá trị hiện có |
| Q5 | Head bar hiện Display name hay họ tên đầy đủ? | Display name, rỗng thì email (như hiện tại) |
| Q6 | Bấm vào tên mở **thẳng** popup, hay mở menu (Profile / Sign out)? | Mở thẳng popup, đúng yêu cầu. Chuyển sang menu khi có thêm mục |
| Q7 | Người dùng `is_managed` (SSO) có được sửa tên không? | Nối tiếp Q5 của login. Tạm cho sửa, vì chưa có SSO |
| Q8 | Giới hạn 50 ký tự cho mỗi tên có hợp lý không? | Có |

## 11. Rủi ro

| # | Rủi ro | Mức | Giảm thiểu |
| --- | --- | --- | --- |
| R1 | Mass assignment: client gửi `isSuperuser`, `email`… để leo quyền | Cao | DTO whitelist + `forbidNonWhitelisted` (đã bật). Service chỉ copy đúng 3 trường; có e2e test #5 |
| R2 | Giả mạo danh tính bằng display name giống admin hoặc người khác ("Admin", ký tự Unicode trông giống nhau) | Trung bình | Chặn ký tự vô hình/điều khiển. Nếu Q3 = unique thì so sánh trên dạng đã chuẩn hoá NFKC + lower |
| R3 | Dữ liệu trong `AuthContext` lệch với server (sửa ở tab khác) | Thấp | Chấp nhận last-write-wins. Có `GET /users/me` để làm mới khi mở popup nếu cần |
| R4 | Tách `SessionGuard` khỏi `AuthController` làm hỏng luồng đăng nhập đang chạy | Trung bình | Giữ nguyên hành vi trượt hạn phiên; chạy lại toàn bộ e2e của auth |
| R5 | Log lộ PII (tên cũ/mới) | Thấp | Chỉ log tên trường, không log giá trị |

## 12. Chỉ số theo dõi

- Tỷ lệ người dùng có `display_name` khác giá trị mặc định (đo mức độ dùng tính năng).
- Số lần mở popup / số lần lưu thành công (nếu thấp: form khó dùng hoặc người dùng chỉ mở để xem).
- Tỷ lệ `400` trên `PATCH /users/me` theo từng trường: trường nào lỗi nhiều thì luật kiểm tra hoặc câu gợi ý đang chưa rõ.
