# Database spec: Đăng nhập

- **Dựa trên:** [`login-analysis.md`](./login-analysis.md). Các mã luật (luật 1–11), rủi ro (R1–R5) và câu hỏi (Q1–Q8) dùng trong file này trỏ về file đó.
- **CSDL đích:** Amazon Aurora DSQL (tương thích PostgreSQL). Xem câu hỏi D1 nếu môi trường dev vẫn dùng PostgreSQL thường.
- **Trạng thái:** bản nháp. **Các câu DDL bên dưới chưa được chạy qua `dsql_lint`**, vì MCP `aurora-dsql` không kết nối được trong phiên này. Phải lint trước khi tạo migration (mục 8).

---

## 1. Ràng buộc của DSQL ảnh hưởng tới thiết kế

| Ràng buộc DSQL | Hệ quả cho spec này |
| --- | --- |
| Không có trigger, không có PL/pgSQL | `updated_at` và mọi cột "tự cập nhật" do **ứng dụng** ghi, không dựa vào trigger |
| Không có extension (`citext`, `pgcrypto`…) | Email không phân biệt hoa thường dùng cột sinh `email_lower` + `UNIQUE`. UUID dùng hàm có sẵn `gen_random_uuid()` |
| Collation cố định là `C`; không được viết `COLLATE` | So sánh email bằng `lower()`. `ORDER BY email` sắp theo byte (chữ hoa đứng trước chữ thường) |
| Không có expression index, partial index | Thay bằng cột `GENERATED ALWAYS AS (...) STORED` rồi đánh index trên cột đó |
| `INET` chỉ dùng được lúc chạy query, không làm kiểu cột | Lưu IP dạng `varchar(45)` (đủ cho IPv6). Cần phép toán mạng thì ép kiểu `::inet` lúc truy vấn |
| Không có kiểu `ENUM` | Dùng `varchar` + `CHECK` |
| Index phụ phải `CREATE INDEX ASYNC`; mỗi transaction chỉ một câu DDL; DDL và DML tách transaction | Mỗi bước migration là **một câu DDL** (mục 7) |
| Tối đa 3.000 dòng thay đổi mỗi transaction; isolation cố định Repeatable Read; xung đột ghi trả lỗi `40001` | Dọn dữ liệu theo lô ≤ 1.000 dòng. Ứng dụng **retry nguyên transaction** khi gặp `40001` |
| Nên tránh hot key và bộ đếm kiểu đọc rồi ghi | **Không** dùng cột `failed_login_count` trên `users`. Đếm số lần sai từ bảng `login_attempts` (chỉ insert) |
| Khuyến nghị khoá chính UUID | Mọi bảng mới dùng `uuid PRIMARY KEY DEFAULT gen_random_uuid()` |
| Múi giờ hệ thống là UTC | Mọi thời điểm lưu bằng `timestamptz`. `users.user_timezone` chỉ dùng để hiển thị |

Các giới hạn trên là mặc định của AWS, cần kiểm lại trên tài liệu DSQL trước khi chốt kích thước lô.

## 2. Sơ đồ quan hệ

```text
users (1) ──< sessions (n)               phiên đăng nhập, mỗi thiết bị một dòng
users (1) ──< password_reset_tokens (n)  token quên mật khẩu, dùng một lần
login_attempts                           nhật ký chỉ ghi thêm; user_id KHÔNG có FK (mục 4.3)
```

## 3. Bảng `users` (đã có)

Danh sách cột trùng với model `User` của Plane. Kiểu dữ liệu dưới đây suy ra từ model đó và **cần đối chiếu với DB thật** (câu hỏi D2).

### 3.1 Cột

| Cột | Kiểu | Null | Mặc định | Dùng khi đăng nhập | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | không | `gen_random_uuid()` | đọc | PK |
| `password` | `varchar(255)` | không | — | so khớp hash | Hash Django `pbkdf2_sha256$…` hoặc argon2id (R1). Nới từ 128 lên 255 để chứa được hash argon2id |
| `username` | `varchar(128)` | không | — | — | `UNIQUE`. Chưa dùng để đăng nhập (Q2) |
| `email` | `varchar(255)` | có | — | tìm người dùng | Ứng dụng lưu đã `trim` + `lower` |
| **`email_lower`** | `varchar(255)` | có | `GENERATED ALWAYS AS (lower(email)) STORED` | **khoá tìm kiếm** | **Cột mới.** `UNIQUE`. Chặn cả trường hợp dữ liệu cũ có email viết hoa (Q3) |
| `mobile_number` | `varchar(255)` | có | — | — | PII |
| `first_name`, `last_name`, `display_name` | `varchar(255)` | có | `''` | trả về | |
| `avatar` | `text` | có | — | trả về | |
| `avatar_asset_id`, `cover_image_asset_id` | `uuid` | có | — | trả về | FK tới bảng tệp, ngoài phạm vi. Thêm khi có bảng đó (`NOT VALID`) |
| `cover_image` | `varchar(800)` | có | — | — | |
| `date_joined`, `created_at` | `timestamptz` | không | `now()` | — | |
| `updated_at` | `timestamptz` | không | `now()` | ghi | **Ứng dụng tự ghi** (không có trigger) |
| `last_login` | `timestamptz` | có | — | ghi | Trùng nghĩa với `last_login_time`. Giữ để tương thích, ghi cùng giá trị |
| `last_login_time` | `timestamptz` | có | — | ghi | **Nguồn chuẩn** |
| `last_logout_time` | `timestamptz` | có | — | ghi khi đăng xuất | |
| `last_active` | `timestamptz` | có | — | ghi (có giãn cách, mục 5.3) | Nguồn tính DAU |
| `last_login_ip`, `last_logout_ip` | `varchar(45)` | có | — | ghi | PII (R3). Plane dùng 255, rút xuống 45 là đủ |
| `last_login_medium` | `varchar(20)` | có | — | ghi `'email'` | `CHECK` (mục 3.2) |
| `last_login_uagent` | `text` | có | — | ghi (cắt tối đa 512 ký tự) | PII |
| `last_location`, `created_location` | `varchar(255)` | có | — | tuỳ chọn | PII |
| `user_timezone` | `varchar(255)` | không | `'UTC'` | trả về | Tên múi giờ IANA |
| `is_active` | `boolean` | không | `true` | luật 6 | |
| `is_bot` | `boolean` | không | `false` | luật 3 | |
| `bot_type` | `varchar(30)` | có | — | — | Chưa rõ tập giá trị nên chưa đặt `CHECK` (D3) |
| `masked_at` | `timestamptz` | có | — | luật 2 | Khác null nghĩa là tài khoản đã ẩn danh hoá |
| `is_managed` | `boolean` | không | `false` | luật 7 | Ý nghĩa chờ Q5 |
| `is_password_autoset` | `boolean` | không | `false` | luật 4 | |
| `is_password_expired` | `boolean` | không | `false` | luật 9 | |
| `is_password_reset_required` | `boolean` | không | `false` | luật 9 | Hạ về `false` khi đổi mật khẩu xong |
| `is_email_verified` | `boolean` | không | `false` | luật 10 | |
| `is_email_valid` | `boolean` | không | `false` | luồng quên mật khẩu | |
| `is_superuser`, `is_staff` | `boolean` | không | `false` | luật 8 | |
| `token`, `token_updated_at` | `varchar(64)` / `timestamptz` | có | — | **ngưng dùng** | Thay bằng bảng `sessions` (R2). Ngưng ghi, xoá cột ở một migration sau |

### 3.2 Ràng buộc

```sql
-- UNIQUE khai báo ngay trong CREATE TABLE thì có hiệu lực ngay khi tạo bảng
UNIQUE (username)
UNIQUE (email_lower)
CHECK (last_login_medium IS NULL OR last_login_medium IN
       ('email', 'magic-code', 'google', 'github', 'gitlab', 'oidc', 'saml'))
```

Nếu bảng `users` **đã có dữ liệu**, thêm cột sinh và ràng buộc theo các bước 1–2 của mục 7, không tạo lại bảng.

## 4. Bảng mới

### 4.1 `sessions`: phiên đăng nhập (thay `users.token`)

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid         NOT NULL REFERENCES users (id),
  token_hash      varchar(64)  NOT NULL UNIQUE,      -- SHA-256 hex của token gửi trong cookie
  login_medium    varchar(20)  NOT NULL,
  ip              varchar(45),
  user_agent      varchar(512),
  created_at      timestamptz  NOT NULL DEFAULT now(),
  last_used_at    timestamptz  NOT NULL DEFAULT now(),
  expires_at      timestamptz  NOT NULL,
  revoked_at      timestamptz,
  is_reset_only   boolean      NOT NULL DEFAULT false, -- token chỉ được dùng để đổi mật khẩu (luật 9)
  CHECK (login_medium IN ('email', 'magic-code', 'google', 'github', 'gitlab', 'oidc', 'saml')),
  CHECK (expires_at > created_at)
);
```

- Chỉ lưu **hash** của token, không lưu token. Lộ bảng này thì kẻ tấn công vẫn không dùng được phiên.
- Phiên **hợp lệ** khi `revoked_at IS NULL AND expires_at > now()`.
- Đăng xuất: `UPDATE sessions SET revoked_at = now() WHERE id = $1`.
- "Đăng xuất mọi thiết bị": `UPDATE … WHERE user_id = $1 AND revoked_at IS NULL`. Mỗi người có ít phiên nên không chạm giới hạn 3.000 dòng.
- FK để mặc định `NO ACTION`. Người dùng bị xoá theo kiểu ẩn danh hoá (`masked_at`), không xoá dòng, nên không cần `CASCADE`.
- `last_used_at` chỉ cập nhật khi đã cũ hơn 5 phút (mục 5.3).

### 4.2 `password_reset_tokens`

```sql
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid         NOT NULL REFERENCES users (id),
  token_hash   varchar(64)  NOT NULL UNIQUE,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  expires_at   timestamptz  NOT NULL,
  used_at      timestamptz,
  request_ip   varchar(45),
  CHECK (expires_at > created_at)
);
```

- Mặc định token sống 30 phút và chỉ dùng được một lần (khi dùng thì ghi `used_at`).
- Khi tạo token mới, vô hiệu hoá các token cũ còn hiệu lực của cùng người dùng (ghi `used_at = now()` cho chúng).

### 4.3 `login_attempts`: nhật ký đăng nhập, chỉ ghi thêm

```sql
CREATE TABLE IF NOT EXISTS login_attempts (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid,                               -- null khi email không tồn tại
  email_hash   varchar(64)  NOT NULL,              -- SHA-256 hex của lower(trim(email))
  ip           varchar(45)  NOT NULL,
  user_agent   varchar(512),
  medium       varchar(20)  NOT NULL DEFAULT 'email',
  result       varchar(20)  NOT NULL,
  reason       varchar(30),
  created_at   timestamptz  NOT NULL DEFAULT now(),
  CHECK (result IN ('success', 'failure', 'blocked')),
  CHECK (reason IS NULL OR reason IN (
    'unknown_email', 'masked', 'bot', 'password_not_set', 'wrong_password',
    'inactive', 'managed_sso', 'not_superuser', 'rate_limited', 'reset_required'))
);
```

- **Lưu `email_hash`, không lưu email gõ vào.** Email gõ sai hoặc không tồn tại vẫn là PII. Hash vẫn đủ để đếm số lần thử theo từng email.
- **`user_id` cố ý không có FK.** Nhật ký phải tồn tại lâu hơn dữ liệu người dùng, và FK sẽ thêm một lần đọc `users` ở mỗi insert. Khi DSQL gặp xung đột lúc kiểm tra FK, insert có thể nhận `40001` ngay giữa đợt bị tấn công.
- Giá trị `reason` ứng với các luật 1–9 trong `login-analysis.md`. `reset_required` đi cùng `result = 'success'`.

## 5. Truy vấn và transaction

### 5.1 Tìm người dùng (luật 1–4)

```sql
SELECT id, password, is_active, is_bot, masked_at, is_managed, is_password_autoset,
       is_password_expired, is_password_reset_required, is_email_verified,
       is_superuser, display_name, avatar, user_timezone
FROM users
WHERE email_lower = lower($1);          -- dùng index UNIQUE trên email_lower
```

Bước so khớp hash (tốn CPU) chạy **ngoài transaction ghi**, để transaction ngắn và ít xung đột.

### 5.2 Giới hạn số lần thử (R5)

```sql
SELECT count(*) FROM login_attempts
WHERE email_hash = $1 AND result <> 'success' AND created_at > now() - interval '15 minutes';

SELECT count(*) FROM login_attempts
WHERE ip = $1 AND result <> 'success' AND created_at > now() - interval '15 minutes';
```

Từ 5 lần sai theo email, hoặc 50 lần sai theo IP: trả `429` và ghi `result = 'blocked'`, `reason = 'rate_limited'`. Ngưỡng là đề xuất, cần chốt.

### 5.3 Đăng nhập thành công: một transaction, 3 dòng

```sql
BEGIN;
UPDATE users SET
  last_login = now(), last_login_time = now(), last_active = now(),
  last_login_ip = $2, last_login_medium = 'email', last_login_uagent = $3,
  updated_at = now()
WHERE id = $1;

INSERT INTO sessions (user_id, token_hash, login_medium, ip, user_agent, expires_at, is_reset_only)
VALUES ($1, $4, 'email', $2, $3, now() + interval '7 days', $5);

INSERT INTO login_attempts (user_id, email_hash, ip, user_agent, result, reason)
VALUES ($1, $6, $2, $3, 'success', $7);   -- $7 = 'reset_required' hoặc NULL
COMMIT;
```

- **Gặp `40001` thì retry nguyên transaction** (tối đa 3 lần, có backoff), và tạo token mới cho mỗi lần thử để không trùng `token_hash`.
- **Không retry** khi gặp `23503` (vi phạm FK). Đó là lỗi dữ liệu.
- `last_active` và `sessions.last_used_at` ở các request sau chỉ cập nhật khi giá trị đã cũ hơn 5 phút. Nhờ vậy mỗi request không phải ghi vào dòng `users`, giảm xung đột trên chính dòng đó:

```sql
UPDATE users SET last_active = now()
WHERE id = $1 AND (last_active IS NULL OR last_active < now() - interval '5 minutes');
```

### 5.4 Đăng nhập thất bại

Chỉ chạy **một** câu `INSERT INTO login_attempts (…, result = 'failure', reason = …)`. Không ghi gì vào `users`.

### 5.5 Đăng xuất

Một transaction gồm hai câu: `UPDATE sessions SET revoked_at = now()`, và `UPDATE users SET last_logout_time = now(), last_logout_ip = $2, updated_at = now()`.

## 6. Index

| Bảng | Index | Phục vụ | Cách tạo |
| --- | --- | --- | --- |
| `users` | `UNIQUE (email_lower)` | 5.1 | Trong `CREATE TABLE`, hoặc `CREATE UNIQUE INDEX ASYNC` nếu bảng đã có dữ liệu |
| `users` | `UNIQUE (username)` | — | Đã có |
| `sessions` | `UNIQUE (token_hash)` | Kiểm tra phiên ở mỗi request | Trong `CREATE TABLE`. **Không** tạo thêm index trùng |
| `sessions` | `idx_sessions_user_id (user_id, revoked_at)` | Đăng xuất mọi thiết bị, danh sách phiên | `CREATE INDEX ASYNC` |
| `sessions` | `idx_sessions_expires_at (expires_at)` | Dọn phiên hết hạn | `CREATE INDEX ASYNC` |
| `password_reset_tokens` | `UNIQUE (token_hash)` | Dùng token | Trong `CREATE TABLE` |
| `password_reset_tokens` | `idx_prt_user_id (user_id, used_at)` | Vô hiệu hoá token cũ | `CREATE INDEX ASYNC` |
| `login_attempts` | `idx_la_email_time (email_hash, created_at)` | 5.2 theo email | `CREATE INDEX ASYNC` |
| `login_attempts` | `idx_la_ip_time (ip, created_at)` | 5.2 theo IP | `CREATE INDEX ASYNC` |
| `login_attempts` | `idx_la_created_at (created_at)` | Dọn dữ liệu cũ, báo cáo KPI | `CREATE INDEX ASYNC` |

Index tạo bằng `ASYNC` chỉ được dùng khi đã sẵn sàng. Kiểm tra bằng `SELECT indisvalid FROM pg_index WHERE indexrelid = '<tên index>'::regclass`, chờ có `true` rồi mới bật tính năng dựa trên index đó (ví dụ rate limit).

## 7. Thứ tự migration (mỗi bước một câu DDL, một transaction)

| # | Câu lệnh |
| --- | --- |
| 1 | `ALTER TABLE users ADD COLUMN email_lower varchar(255) GENERATED ALWAYS AS (lower(email)) STORED` |
| 2 | Kiểm tra email trùng khi bỏ qua hoa thường: `SELECT lower(email), count(*) FROM users GROUP BY 1 HAVING count(*) > 1`. Có kết quả thì **dừng lại và xử lý dữ liệu trước** |
| 3 | `CREATE UNIQUE INDEX ASYNC users_email_lower_key ON users (email_lower)`, rồi chờ `indisvalid` |
| 4 | `ALTER TABLE users ALTER COLUMN password TYPE varchar(255)`. Đổi kiểu cột trên DSQL có thể phải tạo lại bảng. Đọc `ddl-migrations/overview.md` của skill DSQL trước khi làm bước này |
| 5 | `ALTER TABLE users ADD CONSTRAINT users_last_login_medium_check CHECK (…) NOT VALID` |
| 6 | `ALTER TABLE ASYNC users VALIDATE CONSTRAINT users_last_login_medium_check`, theo dõi qua `sys.jobs` |
| 7 | `CREATE TABLE sessions …` |
| 8 | `CREATE TABLE password_reset_tokens …` |
| 9 | `CREATE TABLE login_attempts …` |
| 10–15 | Mỗi `CREATE INDEX ASYNC` ở mục 6 là một bước riêng |
| sau khi ra mắt | Ngưng ghi `users.token`. Một release sau đó mới `ALTER TABLE users DROP COLUMN token`, rồi `DROP COLUMN token_updated_at` (mỗi câu một bước) |

Mọi bước đều dùng `IF NOT EXISTS` khi có thể, để chạy lại an toàn.

## 8. Vận hành

- **Lint:** chạy `dsql_lint(fix=true)` cho từng câu DDL trong file này trước khi đưa vào migration. Câu nào bị báo `unfixable` thì dừng lại xử lý.
- **Dọn dữ liệu:** một job chạy hằng ngày, xoá theo lô 1.000 dòng, lặp tới khi hết:
  - `login_attempts` cũ hơn 90 ngày,
  - `sessions` đã hết hạn hoặc bị thu hồi từ hơn 30 ngày trước,
  - `password_reset_tokens` hết hạn từ hơn 7 ngày trước.

  ```sql
  DELETE FROM login_attempts WHERE id IN (
    SELECT id FROM login_attempts WHERE created_at < now() - interval '90 days' LIMIT 1000);
  ```
- **Quyền truy cập:** ứng dụng kết nối bằng một role riêng có quyền hẹp (DSQL ánh xạ IAM sang role CSDL), không dùng `admin`. Token xác thực IAM hết hạn sau 15 phút và kết nối tự đóng sau 60 phút, nên pool kết nối phải tự cấp token mới.
- **PII:** `last_login_ip`, `last_login_uagent`, `last_location`, `login_attempts.ip`, `sessions.ip` và `sessions.user_agent` không được ghi ra log ứng dụng. Thời hạn lưu giữ theo các mốc ở trên.

## 9. Câu hỏi cần chốt (bổ sung cho Q1–Q8)

| # | Câu hỏi | Đề xuất |
| --- | --- | --- |
| D1 | CLAUDE.md đang ghi "PostgreSQL" và dự định chạy Postgres bằng Docker ở máy dev. Cú pháp `CREATE INDEX ASYNC` và `ALTER TABLE ASYNC` **không chạy được** trên Postgres thường. Đã chốt dùng DSQL chưa? | Nếu chốt DSQL: dev dùng một cluster DSQL riêng cho dev, và cập nhật CLAUDE.md. Nếu không: bỏ `ASYNC` và dùng lại expression index `lower(email)` |
| D2 | Kiểu cột thật của `users` có khớp mục 3.1 không? Có dữ liệu cần chuyển từ Plane không? | Chạy `get_schema users` trên DB thật rồi đối chiếu |
| D3 | `bot_type` có những giá trị nào? | Chưa đặt `CHECK` cho tới khi biết |
| D4 | ORM (TypeORM hay Prisma) chưa chọn. Migration do ORM sinh ra có giữ được luật một DDL mỗi transaction và `ASYNC` không? | Viết migration bằng SQL tay. ORM chỉ dùng để truy vấn. Thêm ORM là dependency mới, cần hỏi trước |
| D5 | Ngưỡng rate limit (5 lần theo email, 50 lần theo IP, trong 15 phút) và thời hạn phiên 7 ngày có ổn không? | Như đề xuất |
