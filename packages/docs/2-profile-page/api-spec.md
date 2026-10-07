# API spec: Popup chỉnh sửa Profile

- **Dựa trên:**
  - [`profile-draft-ui.png`](./profile-draft-ui.png)
  - [`profile-analysis.md`](./profile-analysis.md): luật mục 5, câu hỏi Q1–Q8, rủi ro R1–R5
  - [`database-spec.md`](./database-spec.md): truy vấn mục 3, câu hỏi D6–D8
  - Quy ước chung của API ở [`../1-login-page/api-spec.md`](../1-login-page/api-spec.md), mục 2 (base URL, định dạng lỗi, request ID, `Cache-Control`). File này không nhắc lại.
- **Trạng thái:** bản nháp, viết theo các đề xuất mặc định của Q1–Q8.
- **Phạm vi:** đọc và sửa họ tên, display name của người dùng đang đăng nhập. Cùng với đó là tách guard kiểm tra phiên để mọi endpoint cần đăng nhập dùng chung.

---

## 1. Luồng

```text
Mở app ──► GET /api/auth/session (đã có) ──► AuthContext giữ user
Bấm avatar/tên ở head bar ──► popup mở với user trong AuthContext (không gọi API)
Bấm "Save changes" ──► PATCH /api/users/me  (chỉ gửi trường đã đổi)
                       ├─ 200 ──► AuthContext.updateUser(body), đóng popup, toast "Profile updated"
                       ├─ 400 VALIDATION_ERROR ──► lỗi dưới từng ô theo `fields`
                       ├─ 401 ──► phiên đã hết: về /sign-in
                       └─ 403 / 5xx / mất mạng ──► Alert trong popup, giữ dữ liệu đang gõ
```

`GET /api/users/me` có sẵn nhưng popup MVP không gọi (Q2). Nó dùng cho trang `/settings/profile` sau này, hoặc khi cần làm mới dữ liệu.

## 2. `SessionGuard`: tách khỏi `AuthController`

Hiện tại việc đọc cookie và gọi `authService.getSession()` nằm trong [auth.controller.ts](../../../apps/api/src/auth/auth.controller.ts), ở handler `session`. Endpoint mới cần đúng logic đó, nên tách thành guard.

| Thành phần | Mô tả |
| --- | --- |
| `auth/guards/sessionGuard.ts` | Đọc cookie qua `SessionCookie`, gọi `AuthService.getSession(token)`. Không có phiên: xoá cookie (nếu có) và ném `401 UNAUTHENTICATED`. Có phiên: gắn `request.auth = { userId, isResetOnly }`. Nếu hạn phiên vừa được gia hạn: đặt lại cookie với `renewedMaxAgeMs` |
| Luật phiên chỉ-đổi-mật-khẩu | Phiên `isResetOnly` gọi endpoint thường thì nhận `403 PASSWORD_RESET_REQUIRED` ("Set a new password to continue"). Mã này đã khai báo trong `apiException.ts` nhưng **chưa nơi nào dùng**. Đây là chỗ đầu tiên dùng nó (login api-spec, mục 3.6) |
| `@AllowResetOnlySession()` | Decorator metadata để endpoint đổi mật khẩu bắt buộc bỏ qua luật trên. Profile **không** dùng |
| `auth/currentUser.decorator.ts` | `@CurrentUserId()` trả `request.auth.userId`. Controller không tự đọc `request` |
| Khai báo kiểu | Mở rộng `Express.Request` với `auth?: { userId: string; isResetOnly: boolean }`, giống cách `requestId` đang làm |
| Cách gắn | `@UseGuards(SessionGuard)` **ở từng controller**, không đặt toàn cục: `sign-in`, `session`, `sign-out` và `/health` không cần đăng nhập. Khi số controller cần đăng nhập nhiều lên thì đổi sang guard toàn cục kèm `@Public()` (A7) |
| Export | `AuthModule` export `SessionGuard`, `SessionCookie`, `AuthService` và `UsersRepository` để `UsersModule` dùng |

Handler `GET /api/auth/session` **giữ nguyên hành vi** (`200` cho cả phiên `isResetOnly`), nên không gắn guard này vào nó. Có thể cho handler đó dùng chung một hàm nội bộ với guard để tránh lặp code (R4).

## 3. Endpoint

### 3.1 `GET /api/users/me`

- Guard: `SessionGuard`.
- `200`: body là `UserResponse` (mục 3.3).
- `401 UNAUTHENTICATED`: không có phiên, hoặc tài khoản không còn active hay đã bị masked.
- `403 PASSWORD_RESET_REQUIRED`: phiên chỉ-đổi-mật-khẩu.

### 3.2 `PATCH /api/users/me`

Guard: `SessionGuard`. Request có `Origin` lạ thì `OriginGuard` (toàn cục, đã có) trả `403 ORIGIN_NOT_ALLOWED` trước.

**Request:** mọi trường đều optional, client chỉ gửi trường đã đổi.

```json
{ "firstName": "Kai", "lastName": "Tran", "displayName": "kaitranpo" }
```

| Field | Kiểm tra (class-validator) | Câu lỗi trong `fields` |
| --- | --- | --- |
| `firstName` | `@IsOptional()`, `@IsString()`, `@Length(1, 50)`, `@Matches(NO_HIDDEN_CHARS)` | "Enter your first name" / "First name must be 50 characters or fewer" |
| `lastName` | `@IsOptional()`, `@IsString()`, `@MaxLength(50)`, `@Matches(NO_HIDDEN_CHARS)` | "Last name must be 50 characters or fewer" |
| `displayName` | `@IsOptional()`, `@IsString()`, `@Length(1, 50)`, `@Matches(NO_HIDDEN_CHARS)` | "Enter a display name" / "Display name must be 50 characters or fewer" |
| Ký tự ẩn (cả ba) | `NO_HIDDEN_CHARS = /^[^\p{Cc}\p{Cf}]*$/u` | "Contains characters that aren't allowed" |

- Mỗi trường có `@Transform`: nếu là chuỗi thì `.normalize('NFC').trim()`. **Chuẩn hoá NFC là bắt buộc:** bàn phím tiếng Việt trên macOS có thể gửi dạng tổ hợp (NFD), làm cùng một tên được lưu thành hai chuỗi khác nhau. `ValidationPipe` (`transform: true`) chạy `@Transform` trước khi kiểm tra, nên `"   "` thành `""` và bị `@Length(1, 50)` chặn.
- `\p{Cf}` chặn ký tự vô hình (zero-width space, ký tự đảo chiều chữ). Nó cũng chặn ZWJ, nên emoji ghép (👨‍👩‍👧) bị từ chối. Chấp nhận được với một ô tên.
- `@Length` đếm theo đơn vị UTF-16, nên một emoji tính là 2 ký tự. Chấp nhận được.
- Gửi kèm trường lạ (`email`, `isSuperuser`, `avatar`…) thì `forbidNonWhitelisted` trả `400 VALIDATION_ERROR` (R1).

**Luật trong service** (`ProfileService.updateMe`), chạy theo thứ tự:

| # | Điều kiện | Kết quả |
| --- | --- | --- |
| 1 | Body không có trường nào | `400 VALIDATION_ERROR`, message "Nothing to update", không có `fields` |
| 2 | Đọc user bằng `findActiveById`: không có | `401 UNAUTHENTICATED` |
| 3 | **Trạng thái sau khi gộp** (giá trị mới, hoặc giá trị đang có nếu trường không được gửi) có `firstName` hoặc `displayName` rỗng | `400 VALIDATION_ERROR` kèm `fields` cho trường rỗng. Chặn trường hợp người dùng cũ có `first_name = ''` (database-spec, mục 2.1) chỉ sửa display name |
| 4 | `is_managed = true` | Theo Q7 (mặc định): **vẫn cho sửa**. Khi có SSO, chỗ này trả `403 PROFILE_MANAGED` |
| 5 | Giá trị gửi lên giống hệt giá trị đang có | Bỏ khỏi danh sách cần ghi. Không còn gì để ghi thì trả `200` với dữ liệu hiện tại, **không** chạy `UPDATE` (không đổi `updated_at`) |
| 6 | `updateProfile` trả `null` (tài khoản bị khoá giữa chừng) | `401 UNAUTHENTICATED` |
| 7 | Thành công | `200`, body `UserResponse` từ `RETURNING` |

**Response `200`**

```jsonc
{
  "id": "8d2c…",
  "email": "kaitranpo@gmail.com",
  "displayName": "kaitranpo",
  "firstName": "Kai",
  "lastName": "Tran",
  "avatarUrl": null,
  "timezone": "UTC",
  "isEmailVerified": true,
  "isInstanceAdmin": false
}
```

**Lỗi**

| HTTP | `code` | Khi nào | `message` |
| --- | --- | --- | --- |
| 400 | `VALIDATION_ERROR` | DTO sai, trường lạ, luật 1, luật 3 | "Check the highlighted fields" (kèm `fields`) / "Nothing to update" |
| 401 | `UNAUTHENTICATED` | Không có phiên, luật 2, luật 6 | "Sign in to continue" |
| 403 | `ORIGIN_NOT_ALLOWED` | `Origin` lạ | "Request blocked" |
| 403 | `PASSWORD_RESET_REQUIRED` | Phiên chỉ-đổi-mật-khẩu | "Set a new password to continue" |
| 409 | `DISPLAY_NAME_TAKEN` | **Chỉ khi Q3 = unique** (database-spec, mục 6.1) | "This display name is taken" |

### 3.3 `UserResponse`

Đúng hình của `AuthUserResponse` hiện có, để web ghi thẳng vào `AuthContext`.

- Tách hàm `toAuthUserResponse(user)` ra khỏi `toAuthSessionResponse` trong [authSessionResponse.dto.ts](../../../apps/api/src/auth/dto/authSessionResponse.dto.ts). `toAuthSessionResponse` gọi lại hàm này, nên hai endpoint không bao giờ lệch nhau.
- Map tay từng trường, không trả entity. Response **không bao giờ** chứa `password`, `username`, `last_login_*`, `is_managed` hay `masked_at`.

## 4. Cấu trúc code NestJS

```text
apps/api/src/auth/
  guards/sessionGuard.ts            # MỚI (mục 2)
  guards/sessionGuard.spec.ts       # MỚI
  currentUser.decorator.ts          # MỚI: @CurrentUserId(), @AllowResetOnlySession()
  dto/authSessionResponse.dto.ts    # SỬA: tách toAuthUserResponse
  repositories/usersRepository.ts   # SỬA: findActiveById, updateProfile (database-spec 3.3)
  auth.module.ts                    # SỬA: exports
apps/api/src/users/
  users.module.ts                   # imports: [AuthModule]
  profile.controller.ts             # @Controller('users/me'), @UseGuards(SessionGuard)
  profile.service.ts                # updateMe, getMe
  profile.service.spec.ts
  dto/updateProfile.dto.ts
apps/api/src/app.module.ts          # SỬA: import UsersModule
apps/api/test/users.e2e-spec.ts     # MỚI
```

`UsersRepository` vẫn nằm trong `auth/` cho MVP, để không phải sửa luồng đăng nhập. Khi `users/` có thêm tính năng, chuyển repository sang `users/` và để `AuthModule` import ngược lại (A8).

```ts
// users/profile.controller.ts: controller mỏng, chỉ gọi một hàm service
@Controller('users/me')
@UseGuards(SessionGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  getMe(@CurrentUserId() userId: string): Promise<UserResponse> {
    return this.profileService.getMe(userId);
  }

  @Patch()
  updateMe(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponse> {
    return this.profileService.updateMe(userId, dto);
  }
}
```

```ts
// users/dto/updateProfile.dto.ts
const NO_HIDDEN_CHARS = /^[^\p{Cc}\p{Cf}]*$/u;
const HIDDEN_CHARS_MESSAGE = "Contains characters that aren't allowed";
const normalize = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.normalize('NFC').trim() : value;

export class UpdateProfileDto {
  @IsOptional()
  @Transform(normalize)
  @IsString()
  @Length(1, 50, { message: 'Enter your first name' }) // tách message theo min/max khi cài đặt
  @Matches(NO_HIDDEN_CHARS, { message: HIDDEN_CHARS_MESSAGE })
  firstName?: string;

  // lastName, displayName tương tự (mục 3.2)
}
```

## 5. Log

- Thành công: `Logger.log` sự kiện `profile.updated` kèm `requestId`, `userId`, `changed: ['displayName']`. **Không ghi giá trị** cũ hay mới (R5).
- `400` không cần log. `401` trong luật 6 thì log `warn` (hiếm, nghĩa là tài khoản bị khoá giữa chừng).

## 6. Bảo mật

| Hạng mục | Cách làm |
| --- | --- |
| IDOR | Không có `:id` trên URL. `userId` chỉ lấy từ phiên |
| Mass assignment (R1) | `whitelist` + `forbidNonWhitelisted` (đã bật). Service chỉ copy đúng ba trường sang `ProfileChanges` |
| CSRF | Cookie `SameSite=Lax` + `OriginGuard` cho mọi request không phải GET (đã có) |
| XSS | Tên được React escape khi render. API không lọc HTML |
| Giả mạo danh tính (R2) | Chặn ký tự ẩn (mục 3.2). Q3 = unique thì so sánh trên dạng NFKC + lower |
| Rate limit | Chưa có. Endpoint yêu cầu đăng nhập nên rủi ro thấp. Ghi backlog cùng `@nestjs/throttler` (dependency mới) |
| Cache | Thêm `NoStoreMiddleware` (đã có) cho `ProfileController`: response chứa PII |

## 7. Kiểm thử

| Tầng | Ca chính |
| --- | --- |
| Unit `SessionGuard` | Không cookie → `401`. Phiên không hợp lệ → `401` và xoá cookie. Phiên hợp lệ → gắn `request.auth`. Gia hạn → đặt lại cookie. Phiên `isResetOnly` → `403`, trừ khi có `@AllowResetOnlySession()` |
| Unit `ProfileService` | Đủ 7 luật ở mục 3.2. Luật 5: không gọi `updateProfile` khi không có gì đổi. Luật 3: người dùng cũ có `firstName = ''` chỉ gửi `displayName` → `400` với `fields.firstName` |
| Unit DTO | `"  Kai  "` → `"Kai"`. Chuỗi NFD → NFC. `"​"` → lỗi ký tự ẩn. 51 ký tự → lỗi |
| E2E (`users.e2e-spec.ts`) | Không cookie → `401`. Có cookie → `200` và đọc lại từ DB đúng giá trị. Gửi `email`/`isSuperuser` → `400` và DB không đổi. `Origin` lạ → `403`. Body `{}` → `400`. Hai người dùng: người A không có cách nào sửa người B |
| Hồi quy auth | Toàn bộ `auth.e2e-spec.ts` vẫn qua sau khi tách guard (R4) |

E2E dựng app bằng `createE2eApp()` như hiện tại. `reset()` đã `TRUNCATE users`, không cần sửa.

## 8. Việc cần chốt

| # | Câu hỏi | Đề xuất |
| --- | --- | --- |
| A6 | Đường dẫn `/api/users/me` hay `/api/profile`? | `/api/users/me`: sau này có `/api/users/:id` cho admin mà không phải đổi tên |
| A7 | `SessionGuard` gắn theo từng controller hay toàn cục kèm `@Public()`? | Theo từng controller cho tới khi có từ 3 controller cần đăng nhập trở lên, rồi đổi sang toàn cục |
| A8 | Chuyển `UsersRepository` từ `auth/` sang `users/` ngay bây giờ? | Chưa. Làm khi `users/` có tính năng thứ hai |
| — | Q1–Q8, D6–D8 | Vẫn mở. Q3 quyết định có mã `409` hay không |
