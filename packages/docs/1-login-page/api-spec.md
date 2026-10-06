# API spec: Đăng nhập

- **Dựa trên:**
  - [`login-draft-ui.png`](./login-draft-ui.png) và bản dựng `apps/web/src/features/auth/LoginPage.tsx`
  - [`login-analysis.md`](./login-analysis.md): luật 0–11, rủi ro R1–R5, câu hỏi Q1–Q8
  - [`database-spec.md`](./database-spec.md): các bảng `users`, `sessions`, `password_reset_tokens`, `login_attempts`
- **Trạng thái:** bản nháp. Spec này **đè lên** `database-spec.md` ở hai điểm, lấy theo lượt review PostgreSQL: cách băm email (mục 6.3) và cách đếm số lần thử (mục 6.2). Cần cập nhật lại `database-spec.md` cho khớp.
- **Phạm vi:**
  - Đăng nhập, kiểm tra phiên, đăng xuất.
  - Hai luồng mà màn đăng nhập dẫn sang: "Forgot password?" và bắt buộc đổi mật khẩu (luật 9).
  - Không gồm đăng ký, OAuth, MFA.

---

## 1. Luồng trên màn đăng nhập

```text
Mở /sign-in ──► GET /api/auth/session
                 ├─ 200: đã đăng nhập ──► chuyển vào app
                 └─ 401: hiện form

Bấm "Sign in" ──► POST /api/auth/sign-in
                 ├─ 200, requiresPasswordReset = false ──► vào app
                 ├─ 200, requiresPasswordReset = true  ──► màn "Set a new password"
                 │                                          └─ POST /api/auth/password/change-required
                 ├─ 400 / 401 / 403 ──► hiện message phía trên nút (role="alert")
                 └─ 429 ──► hiện message kèm số giây phải chờ

"Forgot password?" ──► POST /api/auth/password/forgot ──► email có link
                       └─ link ──► POST /api/auth/password/reset ──► quay về /sign-in
```

## 2. Quy ước chung

| Mục | Quy ước |
| --- | --- |
| Base URL | `/api` (đã có trong `main.ts`). Web gọi đường dẫn tương đối; Vite proxy chuyển sang `:3000` |
| Định dạng | `application/json; charset=utf-8`. Tên field viết camelCase |
| Phiên đăng nhập | Token ngẫu nhiên, không đọc được nội dung (opaque, không phải JWT), gửi qua cookie `op_session` (mục 6.4). DB chỉ lưu SHA-256 của token (`sessions.token_hash`) |
| Chống CSRF | Cookie `SameSite=Lax`, cộng guard kiểm tra header `Origin` phải bằng `CORS_ORIGIN` ở **mọi** request `POST`, kể cả `sign-in` (chặn login CSRF) |
| Request ID | Đọc `X-Request-Id` nếu client gửi, không có thì tự sinh. Luôn trả lại trong response và gắn vào mọi dòng log |
| Thời gian | ISO 8601, múi giờ UTC (`2026-10-06T15:04:05.000Z`) |
| Cache | Mọi response của `/api/auth/*` có `Cache-Control: no-store` |

### 2.1 Định dạng lỗi

Lỗi của mọi endpoint có cùng một dạng. Một exception filter toàn cục chuyển cả lỗi của `ValidationPipe` sang dạng này:

```jsonc
{
  "statusCode": 401,
  "code": "INVALID_CREDENTIALS",          // máy đọc; frontend dựa vào field này
  "message": "Incorrect email or password", // người đọc; frontend hiển thị nguyên văn
  "requestId": "01J9Z…",
  "fields": { "email": "Enter a valid email" }, // chỉ có khi code = VALIDATION_ERROR
  "retryAfterSeconds": 600                       // chỉ có khi code = TOO_MANY_ATTEMPTS
}
```

Không bao giờ trả về stack trace, câu SQL, hay tên ràng buộc DB.

## 3. Endpoint

### 3.1 `POST /api/auth/sign-in`

**Request**

```json
{ "email": "an@openplany.dev", "password": "secret123" }
```

| Field | Kiểm tra (class-validator) | Ghi chú |
| --- | --- | --- |
| `email` | `@IsEmail()`, `@MaxLength(255)` | `@Transform` để `trim()` và `toLowerCase()` **trước** khi kiểm tra |
| `password` | `@IsString()`, `@IsNotEmpty()`, `@MaxLength(128)` | **Không** áp chính sách độ mạnh mật khẩu ở bước đăng nhập, vì mật khẩu cũ có thể ngắn hơn chính sách mới. Giới hạn 128 ký tự để chặn payload khổng lồ đẩy chi phí băm lên |

**Response `200 OK`**

Kèm header `Set-Cookie: op_session=…`.

```jsonc
{
  "user": {
    "id": "8d2c…",
    "email": "an@openplany.dev",
    "displayName": "An Nguyen",
    "firstName": "An",
    "lastName": "Nguyen",
    "avatarUrl": "https://…",          // null nếu chưa có
    "timezone": "Asia/Ho_Chi_Minh",
    "isEmailVerified": true,
    "isInstanceAdmin": false            // = is_superuser; chỉ dùng cho màn quản trị (Q1)
  },
  "requiresPasswordReset": false
}
```

- Khi `requiresPasswordReset = true`, cookie mang một phiên **chỉ dùng để đổi mật khẩu** (`sessions.is_reset_only = true`). Phiên này hết hạn sau 15 phút.
- Response **không bao giờ** chứa: `password`, `token`, `last_login_ip`, `last_login_uagent`, các cờ `is_*` khác, `masked_at`.

**Lỗi**

| HTTP | `code` | Khi nào (luật trong `login-analysis.md`) | `message` |
| --- | --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Luật 0 | "Check the highlighted fields" (kèm `fields`) |
| 401 | `INVALID_CREDENTIALS` | Luật 1–5: email không tồn tại, `masked_at`, `is_bot`, `is_password_autoset`, sai mật khẩu | "Incorrect email or password" |
| 403 | `ACCOUNT_DEACTIVATED` | Luật 6, chỉ báo khi mật khẩu **đúng** | "Your account is deactivated. Contact your admin." |
| 403 | `SSO_REQUIRED` | Luật 7 (chờ Q5) | "Sign in with your organization's SSO" |
| 403 | `NOT_INSTANCE_ADMIN` | Luật 8, chỉ khi đây là màn quản trị (Q1) | "You don't have access to instance settings" |
| 403 | `ORIGIN_NOT_ALLOWED` | `Origin` sai | "Request blocked" |
| 429 | `TOO_MANY_ATTEMPTS` | Mục 6.2. Kèm header `Retry-After` | "Too many attempts. Try again in 10 minutes." |

### 3.2 `GET /api/auth/session`

Màn đăng nhập gọi endpoint này khi mở trang. App cũng dùng nó để lấy người dùng hiện tại.

- `200`: body giống response của `sign-in`.
  - Nếu `sessions.last_used_at` đã cũ hơn 5 phút: cập nhật `last_used_at`, kéo `expires_at` thêm 7 ngày (nhưng không quá 30 ngày tính từ `created_at`), và cập nhật `users.last_active`.
- `401 UNAUTHENTICATED`: không có cookie, phiên hết hạn, phiên đã bị thu hồi, hoặc người dùng không còn `is_active`. Khi đó trả kèm `Set-Cookie` xoá cookie.
- Phiên `is_reset_only` vẫn trả `200`, với `requiresPasswordReset: true`.

### 3.3 `POST /api/auth/sign-out`

- `204 No Content`, luôn luôn, kể cả khi không có phiên. Đăng xuất phải chạy được ngay cả khi phiên đã hỏng.
- Ghi `sessions.revoked_at`, `users.last_logout_time` và `users.last_logout_ip`, sau đó xoá cookie.

### 3.4 `POST /api/auth/password/forgot`

```json
{ "email": "an@openplany.dev" }
```

- **Luôn trả `202 Accepted`** với body rỗng, dù email có tồn tại hay không. Như vậy không ai dùng endpoint này để dò được email nào đã đăng ký.
- Chỉ gửi email khi tài khoản tồn tại, `is_active`, không `masked_at`, không `is_bot`.
  - Token gồm 32 byte ngẫu nhiên, sống 30 phút. Token cũ còn hiệu lực bị vô hiệu hoá.
  - Link có dạng `${WEB_URL}/reset-password?token=…`.
- Việc gửi email chạy **sau khi đã trả response**, để thời gian phản hồi không cho biết email có tồn tại hay không. Gửi qua interface `MailSender`; hiện chưa có dịch vụ email nào (câu hỏi A4).
- Giới hạn: 3 yêu cầu mỗi giờ cho một email, 20 yêu cầu mỗi giờ cho một IP. Vượt giới hạn vẫn trả `202`, chỉ bỏ qua không gửi và ghi log.

### 3.5 `POST /api/auth/password/reset`

```json
{ "token": "…", "newPassword": "…" }
```

- `204`, trong **một transaction**:
  - đặt `password` mới (argon2id),
  - đặt `is_password_autoset`, `is_password_expired`, `is_password_reset_required` về `false`,
  - ghi `used_at` cho token,
  - **thu hồi mọi phiên** của người dùng.
- Không tự đăng nhập. Frontend chuyển về `/sign-in`.
- Lỗi:
  - `400 INVALID_RESET_TOKEN`: token sai, hết hạn hoặc đã dùng. Message: "This link has expired. Request a new one."
  - `400 WEAK_PASSWORD`: mật khẩu không đạt chính sách (mục 6.1).

### 3.6 `POST /api/auth/password/change-required`

Dùng cho luật 9. Chỉ chấp nhận phiên `is_reset_only`; phiên thường gọi vào thì trả `403`.

```json
{ "newPassword": "…" }
```

- `200`, body giống `sign-in` với `requiresPasswordReset: false`.
- Phiên tạm bị thu hồi và cookie được thay bằng một phiên đầy đủ.
- Mật khẩu mới **phải khác** mật khẩu hiện tại. Trùng thì trả `400 PASSWORD_REUSED`.

**Guard phiên:** mọi endpoint khác trong app phải từ chối phiên `is_reset_only` với `403 PASSWORD_RESET_REQUIRED`.

## 4. Xử lý trong `AuthService.signIn`

```text
1. Kiểm tra Origin (guard), rồi kiểm tra DTO (ValidationPipe)
2. emailKey = HMAC-SHA256(AUTH_HMAC_SECRET, email)
3. Kiểm tra rate limit (mục 6.2). Vượt ngưỡng:
     ghi login_attempts(blocked, rate_limited), trả 429
4. user = usersRepository.findByEmail(email)          -- WHERE lower(email) = $1
5. Nếu user là null, hoặc masked_at, hoặc is_bot, hoặc is_password_autoset:
     vẫn chạy verify với DUMMY_HASH (để thời gian phản hồi như ca thường)
     ghi login_attempts(failure, <reason>), trả 401
6. ok = passwordHasher.verify(user.password, password)
     Hash Django pbkdf2_sha256: verify bằng crypto.pbkdf2, đánh dấu cần băm lại (R1)
   Nếu không ok: ghi login_attempts(failure, wrong_password), trả 401
7. Nếu không is_active: ghi failure(inactive), trả 403. Tương tự với luật 7, 8
8. resetOnly = is_password_expired || is_password_reset_required
9. Một transaction (database-spec.md, mục 5.3):
     UPDATE users (last_login_*; password = hash mới nếu cần băm lại)
     INSERT sessions (token_hash, is_reset_only = resetOnly,
                      expires_at = now + (resetOnly ? 15 phút : 7 ngày))
     INSERT login_attempts(success, resetOnly ? 'reset_required' : null)
10. Đặt cookie, trả response DTO
```

- Bước 6 (băm mật khẩu, tốn CPU) chạy **ngoài** transaction.
- Controller chỉ gọi `authService.signIn(dto, requestContext)`, đặt cookie và trả kết quả. Mọi luật nghiệp vụ nằm trong service, theo CLAUDE.md.

## 5. Cấu trúc code NestJS

```text
apps/api/src/auth/
  auth.module.ts
  auth.controller.ts              # sign-in, session, sign-out
  password.controller.ts          # forgot, reset, change-required
  auth.service.ts                 # signIn, getSession, signOut
  password.service.ts             # luồng quên mật khẩu, đổi mật khẩu
  passwordHasher.ts               # abstract PasswordHasher + Argon2PasswordHasher (+ đọc hash Django)
  rateLimiter.ts                  # abstract LoginRateLimiter + DbLoginRateLimiter
  sessionCookie.ts                # đặt và xoá cookie, đọc cấu hình từ env
  guards/originGuard.ts
  guards/sessionGuard.ts          # gắn request.session và request.user
  dto/signIn.dto.ts
  dto/forgotPassword.dto.ts
  dto/resetPassword.dto.ts
  dto/changeRequiredPassword.dto.ts
  dto/authUserResponse.dto.ts     # map tay từ entity, không trả entity
  repositories/                   # abstract UsersRepository, SessionsRepository,
                                  # LoginAttemptsRepository, PasswordResetTokensRepository
apps/api/src/common/
  apiExceptionFilter.ts           # định dạng lỗi ở mục 2.1
  requestId.middleware.ts
apps/api/test/auth.e2e-spec.ts
```

```ts
// dto/signIn.dto.ts
export class SignInDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
```

- Repository và hasher là **abstract class**, được bind bằng custom provider (CLAUDE.md). Chưa chọn ORM nên phần cài đặt repository để sau (database-spec, D4).
- Khi có package `@repo/contracts`, các type `SignInRequest`, `AuthSessionResponse` và `ApiError` chuyển sang đó dưới dạng Zod schema để web dùng chung.

## 6. Bảo mật

### 6.1 Mật khẩu

- Băm bằng **argon2id**, tham số tối thiểu theo khuyến nghị OWASP: `m = 19 MiB, t = 2, p = 1`.
- Hash Django `pbkdf2_sha256$…` vẫn verify được. Lần đăng nhập thành công đầu tiên thì băm lại bằng argon2id (R1).
- Chính sách cho mật khẩu **mới**: 8–128 ký tự, không bắt buộc kiểu ký tự. Có thể chặn thêm mật khẩu nằm trong danh sách phổ biến (A5).

### 6.2 Giới hạn số lần thử

Chỉ đếm `result = 'failure'`, trong cửa sổ trượt 15 phút.

| Khoá | Ngưỡng | Hành động |
| --- | --- | --- |
| IP | 50 lần sai | `429`, khoá cứng 15 phút |
| (emailKey, IP) | 5 lần sai | `429`, khoá cứng 15 phút |
| emailKey, mọi IP | 20 lần sai | **Không khoá.** Trì hoãn phản hồi tăng dần (1s, 2s, tối đa 5s) |

Không khoá cứng theo email: nếu khoá, kẻ xấu chỉ cần cố tình gõ sai email của người khác là khoá được tài khoản của họ.

Cách đếm là truy vấn bảng `login_attempts`. Bảng này cần thêm index `(email_hash, ip, created_at)`. Nếu sau này có Redis thì thay bằng `RedisLoginRateLimiter`, interface giữ nguyên.

### 6.3 Dữ liệu cá nhân

- `login_attempts.email_hash` = **HMAC-SHA256 có secret**, không phải SHA-256 trần. SHA-256 trần dò ngược được bằng danh sách email có sẵn.
- Log dùng `Logger` của Nest, chỉ ghi `requestId`, `userId`, `reason`, và 8 ký tự đầu của `emailKey`. Không bao giờ ghi email, mật khẩu, token hay cookie.

### 6.4 Cookie phiên

```text
Set-Cookie: op_session=<base64url 32 byte>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800
```

- Đọc cookie cần `cookie-parser`, hoặc tự parse header `Cookie` (A1).
- Đổi tên cookie sang `__Host-op_session` khi chạy production qua HTTPS.

### 6.5 Thêm vào `main.ts`

| Hạng mục | Thay đổi |
| --- | --- |
| CORS | Đọc origin từ `CORS_ORIGIN` thay vì viết cứng (CLAUDE.md) |
| Header bảo mật | `helmet` (A1) |
| Proxy | `app.set('trust proxy', …)` theo môi trường, để đọc đúng IP thật cho `last_login_ip` và rate limit |
| Exception filter | Đăng ký `ApiExceptionFilter` toàn cục |

### 6.6 Biến môi trường mới

Cần thêm vào `apps/api/.env.example`:

```dotenv
CORS_ORIGIN=http://localhost:5173
WEB_URL=http://localhost:5173
AUTH_HMAC_SECRET=change-me-32-bytes-min
SESSION_COOKIE_SECURE=true        # false nếu trình duyệt dev không nhận cookie Secure trên http://localhost
SESSION_TTL_DAYS=7
SESSION_ABSOLUTE_TTL_DAYS=30
TRUST_PROXY=false
```

## 7. Nối với frontend

`LoginPage` đã có prop `onSubmit`. Hàm này reject với `Error(message)` thì message hiện ngay trên nút. Nối như sau:

```ts
async function signIn(values: LoginValues): Promise<void> {
  const response = await fetch('/api/auth/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });
  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.message);
  }
  const session = (await response.json()) as AuthSessionResponse;
  navigate(session.requiresPasswordReset ? '/set-password' : '/');
}
```

- Lỗi `VALIDATION_ERROR` hiện ở dưới từng ô theo `fields`. Hiện `LoginPage` chưa có chỗ hiển thị lỗi theo ô; tạm thời hiện `message` chung.
- Cookie cùng origin (đi qua proxy của Vite) nên không cần `credentials: 'include'`.
- Web hiện chưa có router. Các route `/sign-in`, `/set-password`, `/forgot-password` và `/reset-password` cần chọn một thư viện router, là dependency mới (A2).

## 8. Kiểm thử

| Tầng | Ca chính |
| --- | --- |
| Unit `AuthService` | Đủ 12 luật ở `login-analysis.md`. Email không tồn tại vẫn gọi verify với `DUMMY_HASH`. Hash Django được verify và băm lại. Không có cột `last_login_*` nào đổi khi thất bại |
| Unit `DbLoginRateLimiter` | Ba ngưỡng ở mục 6.2. Lần `blocked` không được tính. Cửa sổ trượt đúng |
| Unit `PasswordService` | Token hết hạn hoặc đã dùng. Thu hồi mọi phiên sau khi đặt lại mật khẩu. `PASSWORD_REUSED` |
| E2E (Supertest) | `200` có `Set-Cookie` và không có field nhạy cảm nào trong body. `401` có body giống hệt nhau cho email sai và mật khẩu sai. `403` khi sai `Origin`. `429` có header `Retry-After`. `forbidNonWhitelisted`: gửi thêm field lạ thì nhận `400`. Phiên `is_reset_only` gọi endpoint khác thì nhận `403` |

Theo CLAUDE.md: test e2e phải tự áp `setGlobalPrefix('api')`, `ValidationPipe`, filter và guard, vì `Test.createTestingModule` không chạy `main.ts`.

Coverage `auth/` nhắm gần 100%, vì đây là đường đi quan trọng.

## 9. Việc cần chốt

| # | Câu hỏi | Đề xuất |
| --- | --- | --- |
| A1 | Thêm `cookie-parser` và `helmet` (dependency mới) | Đồng ý thêm. Cả hai nhỏ và là chuẩn của NestJS |
| A2 | Router cho web (dependency mới) | `react-router`. Màn đăng nhập cần ít nhất 4 route |
| A3 | Thư viện argon2 | Node 24 có `crypto.argon2` (cần kiểm tra trên đúng bản trong `.nvmrc`; máy hiện chạy Node 22, chưa có). Không có thì dùng gói `argon2` (dependency mới) |
| A4 | Gửi email bằng dịch vụ nào? | Interface `MailSender`. Dev ghi email ra log (bỏ phần token), production chọn sau |
| A5 | Có chặn mật khẩu nằm trong danh sách rò rỉ không? | Để sau. Gọi dịch vụ ngoài là thêm một phụ thuộc |
| — | Q1–Q8 (`login-analysis.md`), D1–D5 (`database-spec.md`) | Vẫn mở, đặc biệt Q1 (màn này dành cho ai) và D1 (DSQL hay PostgreSQL) |
