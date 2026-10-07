# Database spec: Popup chỉnh sửa Profile

- **Dựa trên:** [`profile-analysis.md`](./profile-analysis.md): luật ở mục 5, câu hỏi Q1–Q8, rủi ro R1–R5. Mọi mã như vậy trong file này trỏ về file đó.
- **CSDL đích:** PostgreSQL 17, theo migration đã chạy `1791379542810-CreateAuthTables.ts`. Câu D1 của login đã chốt là PostgreSQL thường (không phải DSQL).
- **Trạng thái:** bản nháp. Viết theo **các đề xuất mặc định** của Q1–Q8 vì chưa được chốt. Đáp án khác thì xem mục 6.

---

## 1. Tóm tắt

Phạm vi MVP chỉ cho sửa `first_name`, `last_name` và `display_name`, và cả ba cột đã có trong bảng `users`. Vì vậy:

- **Không cần migration.**
- **Không đổi entity `User`.** Các trường `firstName`, `lastName`, `displayName`, `updatedAt` đã được map.
- Chỉ thêm hai hàm vào `UsersRepository`: `findById` và `updateProfile` (mục 3).

Chỉ phát sinh migration khi đổi đáp án Q1 (upload ảnh) hoặc Q3 (display name unique). Xem mục 6.

## 2. Cột liên quan

| Cột | Kiểu | Null | Mặc định | Đọc | Ghi | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | không | `gen_random_uuid()` | ✔ | | Lấy từ phiên, không lấy từ request |
| `first_name` | `varchar(255)` | **có** | `''` | ✔ | ✔ | |
| `last_name` | `varchar(255)` | **có** | `''` | ✔ | ✔ | |
| `display_name` | `varchar(255)` | **có** | `''` | ✔ | ✔ | Không unique (Q3) |
| `email` | `varchar(255)` | có | — | ✔ | ✘ | Chỉ đọc |
| `avatar` | `text` | có | — | ✔ | ✘ | Q1 |
| `user_timezone` | `varchar(255)` | không | `'UTC'` | ✔ | ✘ | Q4 |
| `updated_at` | `timestamptz` | không | `now()` | | ✔ | Ứng dụng tự ghi, không có trigger |
| `is_active`, `masked_at` | | | | ✔ | | Điều kiện trong câu `UPDATE` (mục 3.2) |

### 2.1 Dữ liệu hiện có

- Script `user:create` ([createUser.ts](../../../apps/api/src/scripts/createUser.ts)) chỉ ghi `display_name`. Vì vậy **mọi tài khoản hiện có đều có `first_name = ''`**, và `display_name` cũng có thể là `''`.
- Ba cột tên đều cho phép `NULL`, dù mặc định là `''`. Entity đang khai báo `string | null`. Code phải coi `NULL` và `''` là như nhau ("chưa có"), giống `toAuthSessionResponse` đang làm (`?? ''`).

Hệ quả: lần đầu mở popup, ô First name của mọi người dùng cũ đều trống. Ô này là bắt buộc, nên họ phải điền First name thì mới lưu được bất kỳ thay đổi nào. Đây là hành vi mong muốn (api-spec, mục 3.2, luật "trạng thái sau khi gộp").

### 2.2 Tại sao chưa thêm `CHECK` ở tầng DB

Luật "bắt buộc" và "tối đa 50 ký tự" (`profile-analysis.md`, mục 5.1) **chỉ kiểm tra ở ứng dụng**, chưa đặt thành ràng buộc trong DB:

| Ràng buộc có thể thêm | Lý do chưa thêm |
| --- | --- |
| `CHECK (char_length(btrim(first_name)) > 0)` | Mọi dòng cũ đang vi phạm (mục 2.1). Thêm với `NOT VALID` thì vẫn chặn script `user:create` |
| `CHECK (char_length(first_name) <= 50)` | Giới hạn 50 còn chờ Q8. Đổi giới hạn trên ứng dụng không cần migration |

Khi Q8 đã chốt và dữ liệu cũ đã được điền đủ, có thể thêm các `CHECK` này với `NOT VALID`, rồi `VALIDATE CONSTRAINT` ở một migration sau.

## 3. Truy vấn

Mọi truy vấn đều qua `UsersRepository` (TypeORM query builder, tham số hoá). Controller không gọi repository trực tiếp.

### 3.1 Đọc profile (`GET /api/users/me`)

```sql
SELECT id, email, first_name, last_name, display_name, avatar, user_timezone,
       is_email_verified, is_superuser
FROM users
WHERE id = $1 AND is_active AND masked_at IS NULL;
```

Tìm theo khoá chính, không cần thêm index.

### 3.2 Cập nhật profile (`PATCH /api/users/me`)

Một câu duy nhất, chỉ `SET` các cột có trong request:

```sql
UPDATE users
SET first_name   = $2,          -- chỉ khi request có firstName
    last_name    = $3,          -- chỉ khi request có lastName
    display_name = $4,          -- chỉ khi request có displayName
    updated_at   = now()
WHERE id = $1 AND is_active AND masked_at IS NULL
RETURNING id, email, first_name, last_name, display_name, avatar, user_timezone,
          is_email_verified, is_superuser;
```

- **Một câu nên không cần transaction tường minh.** PostgreSQL tự bọc mỗi câu trong một transaction.
- Điều kiện `is_active AND masked_at IS NULL` nằm ngay trong câu `UPDATE`. Nhờ vậy, tài khoản bị khoá **giữa** lúc guard kiểm tra phiên và lúc ghi vẫn không bị sửa được. `RETURNING` không trả dòng nào thì service báo `401`.
- `RETURNING` trả luôn dữ liệu mới, nên không cần thêm một câu `SELECT`.
- **Ghi đồng thời:** hai tab cùng lưu thì `UPDATE` sau thắng (last-write-wins, R3). Khoá dòng của PostgreSQL bảo đảm không lưu nửa vời. Chưa cần kiểm tra theo `updated_at` (optimistic locking), vì người dùng chỉ sửa profile của chính mình.
- Ứng dụng đã `trim` giá trị trước khi ghi. DB lưu đúng chuỗi nhận được.

### 3.3 Interface repository

```ts
export interface ProfileChanges {
  firstName?: string;
  lastName?: string;
  displayName?: string;
}

export abstract class UsersRepository {
  abstract findByEmail(email: string): Promise<User | null>;           // đã có
  /** null khi không tồn tại, không active, hoặc đã bị masked. */
  abstract findActiveById(id: string): Promise<User | null>;
  /** null khi không có dòng nào được cập nhật (mục 3.2). */
  abstract updateProfile(id: string, changes: ProfileChanges, at: Date): Promise<User | null>;
}
```

`at` lấy từ `Clock` (đã có trong `auth/`), không dùng `now()` của DB, để unit test cố định được thời gian, giống `signIn`.

## 4. Script `user:create`

Đề xuất thêm tham số tuỳ chọn để dữ liệu dev có đủ tên:

```bash
pnpm --filter @repo/api user:create an@openplany.dev "An Nguyen" --first-name An --last-name Nguyen
```

Không bắt buộc cho MVP. Không có tham số thì giữ hành vi cũ (`first_name = ''`).

## 5. Dữ liệu cá nhân

- Họ tên là **PII**. Log chỉ ghi **tên các cột đã đổi**, không ghi giá trị (R5).
- Ẩn danh hoá tài khoản (ghi `masked_at`) hiện chưa có quy trình. Khi làm quy trình đó, phải xoá luôn `first_name`, `last_name`, `display_name` và `avatar`, chứ không chỉ ghi `masked_at`. Ghi vào backlog.

## 6. Migration chỉ cần khi đổi đáp án

### 6.1 Q3 = display name phải unique

```sql
-- Bước 1: kiểm tra trùng, có kết quả thì dừng lại xử lý dữ liệu trước
SELECT lower(display_name), count(*) FROM users
WHERE display_name <> '' GROUP BY 1 HAVING count(*) > 1;

-- Bước 2: unique không phân biệt hoa thường, bỏ qua giá trị rỗng
CREATE UNIQUE INDEX CONCURRENTLY users_display_name_lower_key
  ON users (lower(display_name)) WHERE display_name <> '';
```

- `CONCURRENTLY` không chạy được trong transaction. Migration TypeORM của bước này phải đặt `transaction = false`.
- Service bắt lỗi `23505` trên đúng tên index này rồi trả `409 DISPLAY_NAME_TAKEN`. **Không** kiểm tra trước bằng `SELECT`, vì hai người lưu cùng lúc vẫn lọt qua.
- Chuẩn hoá NFKC (R2) làm ở ứng dụng trước khi ghi; index chỉ dùng `lower()`.

### 6.2 Q1 = cho upload avatar và ảnh bìa

Cần một bảng lưu thông tin tệp. Bảng này dùng chung cho mọi tính năng có upload, nên nên có spec riêng. Bản phác:

```sql
CREATE TABLE file_assets (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid          NOT NULL REFERENCES users (id),
  purpose       varchar(30)   NOT NULL,   -- 'avatar' | 'cover' | ...
  storage_key   varchar(512)  NOT NULL UNIQUE,
  content_type  varchar(100)  NOT NULL,
  size_bytes    integer       NOT NULL CHECK (size_bytes > 0),
  created_at    timestamptz   NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CHECK (purpose IN ('avatar', 'cover'))
);
```

Sau đó thêm FK `users.avatar_asset_id` và `users.cover_image_asset_id` → `file_assets(id)` (`NOT VALID`, rồi `VALIDATE`), và map thêm hai cột cùng `cover_image` vào entity `User`.

### 6.3 Q4 = cho chọn múi giờ

Không cần migration: cột `user_timezone` đã có. Ứng dụng kiểm tra giá trị nằm trong `Intl.supportedValuesOf('timeZone')`.

## 7. Câu hỏi cần chốt (bổ sung cho Q1–Q8)

| # | Câu hỏi | Đề xuất |
| --- | --- | --- |
| D6 | Có điền sẵn `first_name` cho người dùng cũ (ví dụ tách từ `display_name`) không? | Không. Người dùng tự điền ở lần mở popup đầu tiên; tách tên tự động dễ sai với tên tiếng Việt |
| D7 | Có thêm `CHECK` độ dài và không rỗng ở tầng DB không? | Chưa. Thêm sau khi Q8 chốt và dữ liệu cũ đã đủ (mục 2.2) |
| D8 | Có cần ghi lịch sử thay đổi profile (bảng audit) không? | Chưa. Log `profile.updated` (không có giá trị) là đủ cho MVP |
