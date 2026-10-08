# Phân tích nghiệp vụ: Màn hình đăng nhập

- **Nguồn:** `login-draft-ui.png` (draft UI) và danh sách cột của bảng người dùng.
- **Trạng thái:** bản nháp, chờ chốt các câu hỏi ở mục 9.
- **Phạm vi:** đăng nhập bằng email và mật khẩu, cùng các bước kiểm tra, ghi nhận và đăng xuất liên quan. Đăng ký, OAuth và luồng quên mật khẩu chỉ được nhắc tới khi chúng ảnh hưởng đến đăng nhập.

---

## 1. Mục tiêu và tiêu chí thành công

| Mục tiêu | Tiêu chí đo |
| --- | --- |
| Người dùng hợp lệ vào được app nhanh, ít lỗi | Tỷ lệ đăng nhập thành công ở lần thử đầu ≥ 90%. Thời gian phản hồi API dưới 500 ms (p95) |
| Không lộ thông tin tài khoản | Mọi lỗi "sai email" và "sai mật khẩu" trả về cùng một câu và cùng một mã lỗi |
| Chặn đúng tài khoản không được phép vào | 100% tài khoản bị khoá, đã xoá hoặc là bot đều bị từ chối (có test cho từng trường hợp) |
| Có dữ liệu để vận hành và kiểm tra | Mỗi lần đăng nhập, dù thành công hay thất bại, đều được ghi lại kèm lý do |

## 2. Đọc draft UI

| Phần tử | Ghi chú nghiệp vụ |
| --- | --- |
| Tiêu đề phụ "Configure instance-wide settings to secure your instance" | Đây là câu của **màn quản trị instance**, không phải màn đăng nhập của người dùng thường. Cần chốt màn này dành cho ai (câu hỏi Q1), vì đáp án quyết định cách dùng `is_superuser` và `is_staff` |
| Email `*` | Bắt buộc. Map vào cột `email` |
| Password `*` và nút mắt | Bắt buộc. So khớp với cột `password` (đã băm) |
| Nút "Sign in" bị khoá khi còn ô trống | Chỉ là kiểm tra phía client. Server vẫn phải kiểm tra lại |
| Không có "Quên mật khẩu", Google/SSO hay "Ghi nhớ đăng nhập" | Bản dựng UI đã thêm link "Forgot password?". Schema hiện tại chưa đủ cột để làm luồng này (mục 6) |

Draft **không có ô username**, dù bảng có cột `username`. Mặc định chỉ đăng nhập bằng email (câu hỏi Q2).

## 3. Cột liên quan và vai trò

Bảng này theo cấu trúc model `User` của Django (có `is_staff`, `is_superuser`, `last_login`, `date_joined`). Vì vậy cột `password` nhiều khả năng lưu theo định dạng hash của Django: `pbkdf2_sha256$<iterations>$<salt>$<hash>`. Nếu có dữ liệu chuyển từ hệ thống cũ sang, API NestJS phải kiểm tra được đúng định dạng này. Xem rủi ro R1.

| Nhóm | Cột | Dùng ở bước đăng nhập |
| --- | --- | --- |
| Định danh | `id`, `email`, `username` | Tìm người dùng theo `email` (chuẩn hoá: trim và chuyển chữ thường) |
| Xác thực | `password`, `is_password_autoset` | Kiểm tra hash. Nếu `is_password_autoset = true`, người dùng chưa tự đặt mật khẩu |
| Chặn hoặc cho vào | `is_active`, `is_bot`, `bot_type`, `masked_at`, `is_managed` | Kiểm tra trước khi cho vào (mục 4) |
| Bắt buộc làm thêm | `is_password_expired`, `is_password_reset_required`, `is_email_verified`, `is_email_valid` | Sau khi mật khẩu đúng, có thể phải đi tiếp sang luồng khác |
| Phân quyền | `is_superuser`, `is_staff` | Chỉ cần nếu đây là màn quản trị instance |
| Phiên đăng nhập | `token`, `token_updated_at` | Cấp hoặc xoay token (xem rủi ro R2) |
| Ghi nhận khi đăng nhập | `last_login`, `last_login_time`, `last_login_ip`, `last_login_medium`, `last_login_uagent`, `last_active`, `last_location`, `updated_at` | Ghi lại khi đăng nhập thành công |
| Ghi nhận khi đăng xuất | `last_logout_time`, `last_logout_ip` | Ghi lại khi đăng xuất |
| Hiển thị sau đăng nhập | `display_name`, `first_name`, `last_name`, `avatar`, `avatar_asset_id`, `user_timezone` | Trả về trong response cho header của app |
| Không dùng ở bước này | `mobile_number`, `cover_image`, `cover_image_asset_id`, `date_joined`, `created_at`, `created_location` | — |

## 4. Luật nghiệp vụ: thứ tự kiểm tra

Server kiểm tra theo đúng thứ tự dưới đây và **dừng ở luật đầu tiên không qua**. Các luật 1–5 trả về **cùng một lỗi chung**, để người ngoài không dò ra được email nào đã có tài khoản.

| # | Điều kiện | Kết quả | Câu hiển thị |
| --- | --- | --- | --- |
| 0 | Email sai định dạng, hoặc thiếu email hay mật khẩu | `400` | "Enter a valid email" / "Enter your password" |
| 1 | Không tìm thấy `email` | `401` | "Incorrect email or password" |
| 2 | `masked_at IS NOT NULL` (tài khoản đã xoá hoặc ẩn danh hoá) | `401`, xử lý như không tồn tại | như trên |
| 3 | `is_bot = true` | `401`. Bot không được đăng nhập bằng mật khẩu | như trên |
| 4 | `is_password_autoset = true` (người dùng chưa từng tự đặt mật khẩu) | `401` | như trên. Có thể thêm gợi ý "Use Forgot password to set one" (Q4) |
| 5 | Mật khẩu không khớp hash | `401`, cộng 1 vào bộ đếm sai (mục 6) | như trên |
| 6 | `is_active = false` | `403`. Chỉ kiểm tra **sau khi** mật khẩu đúng, để không lộ trạng thái tài khoản cho người không có mật khẩu | "Your account is deactivated. Contact your admin." |
| 7 | `is_managed = true` và tài khoản do SSO quản lý | Chặn đăng nhập bằng mật khẩu (Q5) | "Sign in with your organization's SSO" |
| 8 | Màn quản trị **và** `is_superuser = false` | `403` | "You don't have access to instance settings" |
| 9 | `is_password_expired = true` **hoặc** `is_password_reset_required = true` | `200` kèm `requiresPasswordReset: true` và một token chỉ dùng được để đổi mật khẩu | Chuyển sang màn "Set a new password" |
| 10 | `is_email_verified = false` | Mặc định cho vào kèm banner nhắc xác minh (Q6) | — |
| 11 | Qua hết các luật trên | `200`, tạo phiên đăng nhập | Vào trang đầu của app |

`is_email_valid = false` (email bị trả về hoặc không gửi được thư) **không chặn** đăng nhập. Cờ này chỉ ảnh hưởng tới luồng quên mật khẩu, vì thư đặt lại mật khẩu sẽ không tới được người dùng.

## 5. Ghi dữ liệu

**Khi đăng nhập thành công.** Tất cả trong **một transaction**:

```text
last_login        = now()
last_login_time   = now()
last_active       = now()
last_login_ip     = <IP của client, lấy từ X-Forwarded-For đáng tin cậy>
last_login_medium = 'email'
last_login_uagent = <User-Agent, cắt tối đa 512 ký tự>
last_location     = <tuỳ chọn, chỉ khi đã có dịch vụ GeoIP>
token / token_updated_at = <xem rủi ro R2>
updated_at        = now()
```

**Khi đăng xuất:** `last_logout_time = now()`, `last_logout_ip = <IP>`, và huỷ phiên hoặc token.

**Khi đăng nhập thất bại:** không ghi gì vào bảng người dùng. Chỉ ghi vào nhật ký đăng nhập (mục 6).

`last_login` và `last_login_time` trùng nghĩa. Cột đầu là cột mặc định của Django, cột sau là cột được thêm riêng. Nên chọn một cột làm nguồn chuẩn, đề xuất `last_login_time`, và vẫn cập nhật cả hai cho tới khi bỏ được cột kia.

## 6. Khoảng trống của schema

| Thiếu | Ảnh hưởng | Đề xuất |
| --- | --- | --- |
| Bộ đếm đăng nhập sai và thời điểm hết khoá | Không chặn được dò mật khẩu theo từng tài khoản | Giới hạn số lần thử theo IP và theo email, lưu trên Redis hoặc bảng `login_attempts`. Ví dụ: 5 lần sai trong 15 phút thì khoá 15 phút |
| Nhật ký đăng nhập | Không đo được tỷ lệ thất bại và lý do, không điều tra được sự cố | Bảng `login_attempts`: `id`, `user_id` (có thể null), `email_hash`, `ip`, `user_agent`, `result`, `reason`, `created_at` |
| Bảng phiên đăng nhập | Cột `token` duy nhất nghĩa là mỗi người chỉ có một phiên. Đăng nhập trên máy B sẽ đá máy A ra, hoặc hai máy dùng chung một token | Bảng `sessions` hoặc refresh token, mỗi thiết bị một dòng. Bảng này cũng là nền cho "Đăng xuất mọi thiết bị" |
| Token đặt lại mật khẩu | Link "Forgot password?" trên UI chưa có backend | Bảng `password_reset_tokens`: `user_id`, `token_hash`, `expires_at`, `used_at` |
| Xác thực hai lớp (MFA) | Chưa hỗ trợ | Ngoài phạm vi. Ghi vào backlog |

## 7. Hợp đồng API đề xuất

`POST /api/auth/sign-in`

```jsonc
// Request: DTO class-validator, whitelist bật sẵn
{ "email": "an@openplany.dev", "password": "••••••••" }

// 200: phiên đăng nhập đặt trong cookie httpOnly, Secure, SameSite=Lax
{
  "user": { "id": "…", "email": "…", "displayName": "…", "avatar": "…", "timezone": "Asia/Ho_Chi_Minh" },
  "requiresPasswordReset": false
}
```

| Mã | Khi nào |
| --- | --- |
| `400` | DTO không hợp lệ |
| `401` | Luật 1–5 |
| `403` | Luật 6–8 |
| `429` | Vượt giới hạn số lần thử. Kèm header `Retry-After` |

Response **không bao giờ** chứa `password`, `token`, `last_login_ip`, `last_login_uagent` hoặc các cờ nội bộ. Response DTO map tay từng trường, không trả thẳng entity.

`POST /api/auth/sign-out` → `204`.

## 8. Tiêu chí nghiệm thu

1. **Given** email và mật khẩu đúng của tài khoản đang hoạt động, **when** bấm Sign in, **then** vào app, đồng thời `last_login_time`, `last_login_ip`, `last_login_medium = 'email'` và `last_login_uagent` được cập nhật.
2. **Given** email chưa đăng ký **or** mật khẩu sai, **then** cả hai trường hợp nhận cùng câu "Incorrect email or password", cùng mã `401`, và thời gian phản hồi không chênh lệch đáng kể.
3. **Given** `is_active = false` và mật khẩu đúng, **then** nhận `403` với câu "account deactivated", và các cột `last_login_*` không đổi.
4. **Given** `masked_at` khác null hoặc `is_bot = true`, **then** xử lý như email không tồn tại.
5. **Given** `is_password_reset_required = true`, **then** chuyển sang màn đặt mật khẩu mới và chưa vào được app.
6. **Given** sai 5 lần trong 15 phút, **then** lần thứ 6 nhận `429`, kể cả khi mật khẩu đúng.
7. **Given** email nhập là `"  An@OpenPlany.dev "`, **then** vẫn tìm thấy tài khoản `an@openplany.dev`.
8. **Given** ô email hoặc mật khẩu đang trống, **then** nút Sign in bị khoá (đã có trong bản dựng UI).

## 9. Câu hỏi cần chốt

| # | Câu hỏi | Đề xuất mặc định |
| --- | --- | --- |
| Q1 | Màn này là đăng nhập của **người dùng thường** hay **quản trị instance**? | Người dùng thường. Đổi lại tiêu đề phụ. Màn quản trị dùng route riêng và áp luật 8 |
| Q2 | Có cho đăng nhập bằng `username` không? | Không. Chỉ dùng email, đúng như draft |
| Q3 | Email có unique, không phân biệt hoa thường ở tầng DB không? | Có: unique index trên `lower(email)` |
| Q4 | Người có `is_password_autoset = true` nhập mật khẩu thì báo gì? | Lỗi chung. Họ dùng "Forgot password?" để đặt mật khẩu |
| Q5 | `is_managed` cụ thể nghĩa là gì: SSO, LDAP hay do admin tạo hộ? | Cần người nắm hệ thống cũ xác nhận |
| Q6 | Chưa xác minh email (`is_email_verified = false`) thì có cho vào không? | Cho vào, kèm banner nhắc xác minh |
| Q7 | Phiên đăng nhập kéo dài bao lâu? Có cần nhiều thiết bị cùng lúc không? | 7 ngày, có trượt thời hạn khi dùng. Nhiều thiết bị, nên cần bảng `sessions` |
| Q8 | Có chuyển dữ liệu người dùng từ hệ thống cũ sang không? | Nếu có, phải hỗ trợ hash Django PBKDF2 (R1) |

## 10. Rủi ro

| # | Rủi ro | Mức | Giảm thiểu |
| --- | --- | --- | --- |
| R1 | Hash mật khẩu theo định dạng Django. Thư viện Node như bcrypt không đọc được | Cao (nếu chuyển dữ liệu) | Viết hàm kiểm tra `pbkdf2_sha256` bằng `crypto.pbkdf2`. Khi người dùng đăng nhập thành công, băm lại mật khẩu bằng thuật toán mới (argon2id) |
| R2 | Cột `token` có thể lưu token dạng rõ trong bảng người dùng | Cao | Chỉ lưu hash của token, hoặc chuyển hẳn sang bảng `sessions` |
| R3 | `last_login_ip`, `last_login_uagent` và `last_location` là dữ liệu cá nhân | Trung bình | Ghi rõ trong chính sách quyền riêng tư, không ghi vào log, đặt thời hạn lưu giữ |
| R4 | Dò email qua câu lỗi hoặc thời gian phản hồi | Trung bình | Dùng lỗi chung. Khi không tìm thấy email, vẫn chạy một lần so khớp hash giả để thời gian phản hồi tương đương |
| R5 | Chưa có rate limit, dễ bị dò mật khẩu hàng loạt | Cao | Dùng `@nestjs/throttler` kết hợp khoá theo email. Lưu ý: đây là dependency mới, cần hỏi trước khi thêm |

## 11. Chỉ số theo dõi sau khi ra mắt

Các chỉ số dưới đây tính từ bảng `login_attempts`. Bảng này là điều kiện bắt buộc: không có nó thì không đo được chỉ số nào.

- Tỷ lệ thành công = số lần `result = success` / tổng số lần thử, theo ngày.
- Phân bổ lý do thất bại (`wrong_password`, `inactive`, `locked`, `reset_required`…). Nếu `wrong_password` tăng đột biến, có thể đang bị tấn công dò mật khẩu.
- Tỷ lệ bấm "Forgot password?" trên số lượt mở màn đăng nhập. Nếu cao, có thể chính sách mật khẩu đang quá khó.
- Số tài khoản bị khoá theo giờ (đặt cảnh báo khi vượt ngưỡng).
- DAU tính từ `last_active`.
