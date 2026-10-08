# API spec: Tạo Workspace

- **Dựa trên:**
  - [`2 - business-analytics-spec.md`](./2%20-%20business-analytics-spec.md) (**BA**): luồng mục 3, luật mục 5, hợp đồng phác ở mục 7, câu hỏi Q1–Q12, rủi ro R1–R9.
  - [`3 - database-spec.md`](./3%20-%20database-spec.md) (**DB**): truy vấn mục 4, interface repository mục 5.2, câu hỏi DB1–DB8.
  - Quy ước chung của API ở [`../1-login-page/api-spec.md`](../1-login-page/api-spec.md) mục 2 (base URL, định dạng lỗi, request ID, `Cache-Control`). File này không nhắc lại.
  - Code hiện có: `SessionGuard`, `@CurrentUserId()`, `OriginGuard` toàn cục, `ApiException`, `createValidationPipe()`, `Clock`, `NoStoreMiddleware`, mẫu `ProfileController`/`ProfileService`.
- **Trạng thái:** bản nháp, viết theo đề xuất mặc định của Q1–Q12 và DB1–DB8.
- **Phạm vi:** 4 endpoint dưới `/api/workspaces`, guard kiểm tra thành viên, package dùng chung `@repo/contracts`.

---

## 1. Tóm tắt endpoint

| Method | Đường dẫn | Guard | Mục đích | Trả về |
| --- | --- | --- | --- | --- |
| `GET` | `/api/workspaces/slug-check?slug=` | `SessionGuard` | Kiểm tra slug khi đang gõ | `200` `SlugCheckResponse` |
| `POST` | `/api/workspaces` | `SessionGuard` (+ `OriginGuard` toàn cục) | Tạo workspace, người tạo là owner | `201` `WorkspaceResponse` |
| `GET` | `/api/workspaces` | `SessionGuard` | Danh sách cho Switcher và điều hướng sau đăng nhập | `200` `WorkspaceListResponse` |
| `GET` | `/api/workspaces/:slug` | `SessionGuard` + `WorkspaceMemberGuard` | Mở một workspace; ghi nhớ workspace gần nhất | `200` `WorkspaceResponse` |

Mọi response của controller này có `Cache-Control: no-store`. Response chứa tên tổ chức và vai trò của người dùng, nên không được để proxy hay trình duyệt lưu cache (dùng `NoStoreMiddleware` có sẵn).

---

## 2. Luồng

```text
Đăng nhập xong (web)
  └─► GET /api/workspaces ──► 0 workspace ──► ở lại / (trang chủ trống, nút "Create workspace +" trên head bar)
                          └─► có ──► /:lastWorkspaceSlug ──► GET /api/workspaces/:slug ──► 200 (ghi last_workspace_id)
                                                                                       └─► 404 ──► trang "Workspace not found"

/create-workspace
  gõ ──(debounce 300 ms)──► GET /api/workspaces/slug-check?slug=acme ──► { available, reason }
  submit ──► POST /api/workspaces
               ├─ 201 ──► web thêm vào danh sách, chuyển tới /acme
               ├─ 400 VALIDATION_ERROR  (fields.name / fields.slug / fields.organizationSize)
               ├─ 409 SLUG_ALREADY_EXISTS (fields.slug)
               └─ 429 TOO_MANY_ATTEMPTS (retryAfterSeconds)
```

---

## 3. Package dùng chung `@repo/contracts` (Q8)

Luật slug phải **giống hệt** ở web (báo lỗi khi gõ) và API (nguồn chuẩn), nếu không sẽ gặp rủi ro R8. CLAUDE.md đã lên kế hoạch cho package này. Đợt này chỉ tạo phần cần cho workspace, viết bằng **TypeScript thuần**. Zod là dependency mới nên phải hỏi trước (API5).

### 3.1 Nội dung

```ts
// packages/contracts/src/workspace.ts
export const WORKSPACE_NAME_MAX = 80;
export const WORKSPACE_SLUG_MIN = 3;                       // Q3
export const WORKSPACE_SLUG_MAX = 48;
export const WORKSPACE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const ORGANIZATION_SIZES = ['Just myself', '2-10', '11-50', '51-200', '201-500', '500+'] as const;
export type OrganizationSize = (typeof ORGANIZATION_SIZES)[number];

export const WORKSPACE_ROLES = ['owner', 'admin', 'member', 'guest'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** BA 5.4 + "slug-check" (API1). Exact match only. */
export const RESERVED_WORKSPACE_SLUGS: ReadonlySet<string> = new Set([/* … */]);

/** White text ≥ 5.18:1 on every colour (Q5). */
export const WORKSPACE_COLORS = ['#0F172A', '#374151', '#1D4ED8', '#047857',
                                 '#7C3AED', '#C2410C', '#0E7490', '#BE185D'] as const;

export function slugify(name: string): string;              // BA 5.2
export function pickWorkspaceColor(workspaceId: string): (typeof WORKSPACE_COLORS)[number];
export function workspaceSlugProblem(slug: string): 'INVALID' | 'RESERVED' | null;

// Hình dạng request/response (mục 5), để web và API dùng chung một định nghĩa.
export interface CreateWorkspaceRequest { name: string; slug: string; organizationSize: OrganizationSize }
export interface WorkspaceResponse { /* mục 5.2 */ }
export interface WorkspaceListResponse { workspaces: WorkspaceResponse[]; lastWorkspaceSlug: string | null }
export interface SlugCheckResponse { slug: string; available: boolean; reason: SlugUnavailableReason | null }
export type SlugUnavailableReason = 'INVALID' | 'RESERVED' | 'TAKEN';
```

- Danh sách bảo lưu là một `Set`, nên tra cứu nhanh với độ phức tạp O(1).
- Regex được khai báo một lần ở cấp module, không tạo lại mỗi lần gọi.
- `pickWorkspaceColor` băm id (ví dụ FNV-1a trên chuỗi uuid) rồi chia lấy dư cho 8. Kết quả ổn định, nên chạy lại với cùng id luôn cho cùng một màu.

### 3.2 Build: package phải được biên dịch

Khác `@repo/ui` (Vite đọc thẳng mã nguồn TypeScript): API chạy bằng `node dist/main.js`, nên Node phải `import` được JavaScript đã biên dịch.

| Việc | Chi tiết |
| --- | --- |
| `package.json` | `"type": "module"`, `"exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } }`, scripts `build: tsc -p tsconfig.build.json`, `dev: tsc -w`, `typecheck`, `test`, `lint` |
| `tsconfig` | `module`/`moduleResolution: nodenext`, `declaration: true`. Import nội bộ có đuôi `.js`, giống API |
| Turbo | `build` đã có `dependsOn: ["^build"]`. Sửa thêm `typecheck` và `lint` (oxlint type-aware) sang `dependsOn: ["^build"]`, vì API và web cần file `.d.ts` của contracts. `dev` chạy `tsc -w` song song với hai app |
| Phụ thuộc | `apps/api` và `apps/web`: `"@repo/contracts": "workspace:*"` |
| Docker | `turbo prune @repo/api --docker` tự kéo theo package. Không cần sửa `Dockerfile` |
| Test | Vitest cho `slugify` (các ví dụ ở BA 5.2), `workspaceSlugProblem` và `pickWorkspaceColor` |

Đã cân nhắc và không chọn: chép hằng số sang hai app (dễ lệch nhau); để Node 24 tự chạy file `.ts` bằng type stripping (Node không hỗ trợ cách này cho file nằm trong `node_modules`, mà package workspace lại được link vào đó).

---

## 4. Cấu trúc module

```text
apps/api/src/workspaces/
├── workspaces.module.ts            # imports AuthModule, TypeOrmModule.forFeature([Workspace, WorkspaceMember])
├── workspaces.controller.ts        # 4 handler, mỏng
├── workspaces.service.ts           # luật nghiệp vụ, map kết quả repository → response/lỗi
├── workspaceMemberGuard.ts         # nạp workspace theo :slug + kiểm tra thành viên (mục 5.4)
├── slugCheckRateLimiter.ts         # abstract + bản in-memory (mục 6)
├── dto/
│   ├── createWorkspace.dto.ts
│   ├── slugCheckQuery.dto.ts
│   └── workspaceResponse.dto.ts    # toWorkspaceResponse(MemberWorkspace)
├── entities/{workspace,workspaceMember}.entity.ts
└── repositories/workspacesRepository.ts   # DB 5.2
```

- `AppModule` import thêm `WorkspacesModule`.
- `AuthModule` đã export `SessionGuard`, `Clock`, `UsersRepository`. Không cần sửa gì ở đó.
- Provider: `{ provide: WorkspacesRepository, useClass: TypeOrmWorkspacesRepository }` và `{ provide: SlugCheckRateLimiter, useClass: InMemorySlugCheckRateLimiter }`. Service phụ thuộc vào lớp abstract để unit test thay bằng bản giả (CLAUDE.md, mục Backend).
- `ApiErrorCode` thêm `'SLUG_ALREADY_EXISTS'`.

---

## 5. Endpoint

### 5.1 `GET /api/workspaces/slug-check?slug=acme`

**Query DTO:**

| Field | Kiểm tra | Lỗi |
| --- | --- | --- |
| `slug` | `@IsString()`, `@MaxLength(100)` | `400 VALIDATION_ERROR`, `fields.slug = "Enter a workspace URL"` |

Giới hạn 100 (không phải 48) chỉ để chặn query rác. Slug dài 49–100 ký tự vẫn trả `200` với `reason: "INVALID"`, để web hiện cùng một câu lỗi như khi gõ sai.

**Xử lý theo thứ tự** (service):

| # | Điều kiện | Kết quả |
| --- | --- | --- |
| 1 | Vượt giới hạn tần suất (mục 6) | `429 TOO_MANY_ATTEMPTS`, `retryAfterSeconds` |
| 2 | Sai độ dài hoặc regex. **Không** tự chuyển chữ hoa sang chữ thường hay trim | `{ available: false, reason: "INVALID" }` |
| 3 | Có trong danh sách bảo lưu | `{ available: false, reason: "RESERVED" }` |
| 4 | `slugExists` (DB 4.1, kể cả workspace đã xoá) | `{ available: false, reason: "TAKEN" }` |
| 5 | Còn lại | `{ available: true, reason: null }` |

```json
{ "slug": "acme", "available": true, "reason": null }
```

- Không truy vấn DB ở bước 2 và 3.
- Không log từng lần gọi (quá nhiều). Chỉ log khi bị chặn vì tần suất: `workspace.slug_check.rate_limited`, kèm `userId` và `requestId`.

### 5.2 `POST /api/workspaces`

**Request:**

```json
{ "name": "Acme Corporation", "slug": "acme-corp", "organizationSize": "11-50" }
```

**DTO** (class-validator chạy decorator từ dưới lên; `stopAtFirstError` giữ lỗi đầu tiên, nên `@IsString` đặt cuối để câu "Enter …" thắng khi giá trị không phải chuỗi, giống `UpdateProfileDto`):

| Field | `@Transform` | Kiểm tra (từ dưới lên) | Câu lỗi |
| --- | --- | --- | --- |
| `name` | `.normalize('NFC').trim()` nếu là chuỗi | `@IsString` → `@MinLength(1)` → `@MaxLength(80)` → `@Matches(NO_HIDDEN_CHARS)` → `@Matches(NO_URL)` | "Enter a workspace name" / "Workspace name must be 80 characters or fewer" / "Contains characters that aren't allowed" / "Workspace name cannot contain a URL" |
| `slug` | **Không** transform. Client gửi đúng giá trị đã chuẩn hoá | `@IsString` → `@Length(3, 48)` → `@Matches(WORKSPACE_SLUG_PATTERN)` → `@IsNotIn([...RESERVED_WORKSPACE_SLUGS])` | "Enter a workspace URL" / "URL must be between 3 and 48 characters" / "URL can use only lowercase letters, numbers, and single hyphens, and can't start or end with a hyphen" / "This URL is reserved. Choose another one." |
| `organizationSize` | — | `@IsIn(ORGANIZATION_SIZES)` | "Select how many people will use this workspace" |
| Field lạ (`ownerId`, `role`, `timezone`, `id`…) | — | `forbidNonWhitelisted` | `400`, kèm `fields.<tên field>` (R4) |

- `NO_HIDDEN_CHARS = /^[^\p{Cc}\p{Cf}]*$/u`, giống profile. Nên chuyển hằng số này sang `@repo/contracts` để profile và workspace dùng chung.
- `NO_URL = /^(?!.*:\/\/)(?!www\.)/iu`: chặn tên chứa `://` hoặc bắt đầu bằng `www.` (BA 5.1).
- Slug **không** được trim hay chuyển chữ thường ở server. Nếu server âm thầm sửa, slug trong DB sẽ khác slug người dùng vừa thấy là "Available".

**Service `create(userId, dto, requestId)`:**

1. `id = randomUUID()`, `color = pickWorkspaceColor(id)`, `now = clock.now()`.
2. `repository.create(userId, { id, …dto, backgroundColor: color }, now)`. Một transaction gồm advisory lock, đếm tần suất, insert và cập nhật `last_workspace_id` (DB 4.3).
3. Map kết quả:

| Kết quả repository | Response |
| --- | --- |
| `created` | `201`, body `WorkspaceResponse`, header `Location: /api/workspaces/{slug}` |
| `rate_limited` | `429 TOO_MANY_ATTEMPTS`, message "You've created several workspaces recently. Try again later.", `retryAfterSeconds` (filter đã tự đặt header `Retry-After`) |
| `user_inactive` | `401 UNAUTHENTICATED` "Sign in to continue". Tài khoản bị khoá sau khi guard đã kiểm tra phiên |
| ném `SlugAlreadyExistsError` | `409 SLUG_ALREADY_EXISTS`, message "This URL is already taken. Choose another one.", `fields: { slug: <cùng câu> }` |

4. Log `info`: `workspace.created userId=… workspaceId=… organizationSize=… requestId=…`. **Không** log `name` hay `slug` (BA 5.6).

`Location` được đặt qua `@Res({ passthrough: true }) response` (`response.location(...)`). Nest vẫn tự serialize giá trị trả về.

**Response `201`:**

```json
{
  "id": "e4b2d5a1-7c38-4f9e-912b-3a5e8c1029ab",
  "name": "Acme Corporation",
  "slug": "acme-corp",
  "logoUrl": null,
  "backgroundColor": "#1D4ED8",
  "organizationSize": "11-50",
  "timezone": "Asia/Ho_Chi_Minh",
  "role": "owner",
  "memberCount": 1,
  "createdAt": "2026-10-08T14:30:00.000Z"
}
```

`409` có thêm `fields.slug` để web hiện lỗi ngay dưới ô URL (dùng chung đường xử lý với `400`), dù `fields` vốn chỉ có ở `VALIDATION_ERROR` (login api-spec 2.1). Cần ghi lại ngoại lệ này trong file quy ước chung (API6).

### 5.3 `GET /api/workspaces`

```json
{
  "workspaces": [
    { "id": "…", "name": "OpenPlany", "slug": "openplany", "logoUrl": null, "backgroundColor": "#0F172A",
      "organizationSize": "2-10", "timezone": "UTC", "role": "owner", "memberCount": 1,
      "createdAt": "2026-10-01T09:00:00.000Z" },
    { "id": "…", "name": "OpenStudy", "slug": "openstudy", "logoUrl": null, "backgroundColor": "#BE185D",
      "organizationSize": "2-10", "timezone": "UTC", "role": "admin", "memberCount": 5,
      "createdAt": "2026-10-03T09:00:00.000Z" }
  ],
  "lastWorkspaceSlug": "openplany"
}
```

- Mỗi phần tử có **cùng hình** `WorkspaceResponse` như 5.2 và 5.4. Web chỉ cần một kiểu dữ liệu.
- Một truy vấn duy nhất (DB 4.4). Đã sắp theo tên. Không phân trang ở MVP.
- `lastWorkspaceSlug` là `null` khi chưa có, khi workspace đó đã bị xoá, hoặc khi user không còn là thành viên.

### 5.4 `GET /api/workspaces/:slug` và `WorkspaceMemberGuard`

**`WorkspaceMemberGuard`** chạy sau `SessionGuard` và dùng lại được cho mọi endpoint `/api/workspaces/:slug/...` sau này:

1. Lấy `params.slug`. Nếu sai định dạng thì ném `404` ngay, không chạm DB.
2. `repository.findForMember(slug, request.auth.userId)` (DB 4.5).
3. Kết quả `null` → `404 NOT_FOUND` "Workspace not found". Không phân biệt "không tồn tại" với "không phải thành viên" (BA 5.9, R5).
4. Gắn `request.workspace = MemberWorkspace` (mở rộng kiểu `Request`, giống `request.auth`). Decorator `@CurrentWorkspace()` đọc giá trị này.

Phân quyền theo vai trò (`@RequireWorkspaceRole('admin')`) **chưa cần** trong đợt này, nhưng guard đã có `role`, nên thêm sau rất dễ.

**Handler:** trả `toWorkspaceResponse(workspace)`, rồi gọi `service.rememberLastWorkspace(userId, workspace.id)` (DB 4.5, chỉ ghi khi giá trị khác). Câu ghi này lỗi thì log `warn` và **vẫn trả `200`** (Q12).

**Thứ tự route trong controller:** handler `slug-check` phải khai báo **trước** `:slug`. Express khớp route theo thứ tự khai báo, nên nếu đặt sau thì `/api/workspaces/slug-check` sẽ bị coi là workspace có slug `"slug-check"`. Vì cùng lý do đó, `slug-check` phải nằm trong danh sách bảo lưu (API1).

---

## 6. Giới hạn tần suất

| Endpoint | Giới hạn | Cách làm | Khi vượt |
| --- | --- | --- | --- |
| `POST /api/workspaces` | 5 lần tạo trong 1 giờ trượt, theo user | Đếm trong DB, trong cùng transaction, có advisory lock (DB 4.2–4.3). Chính xác kể cả khi chạy nhiều instance | `429`, `retryAfterSeconds` tính từ workspace cũ nhất trong khung giờ |
| `GET /slug-check` | 60 lần mỗi 60 giây trượt, theo user | `InMemorySlugCheckRateLimiter`: `Map<userId, number[]>` chứa các mốc thời gian, cắt bớt mốc cũ ở mỗi lần gọi, xoá key khi mảng rỗng. Thời gian lấy từ `Clock` | `429`, `retryAfterSeconds` |

- Bộ đếm in-memory chỉ đúng **trong một instance** (Q11): hai instance thì giới hạn thực tế thành 120 lần/phút. Chấp nhận được với một endpoint chỉ đọc. Đặt sau lớp abstract `SlugCheckRateLimiter` để sau này đổi sang Redis mà không phải sửa service.
- Với nhịp debounce 300 ms, người gõ nhanh liên tục cũng chỉ tạo khoảng 3 request mỗi giây, nhưng thực tế ít hơn nhiều. Giới hạn 60 lần/phút không ảnh hưởng người dùng thật.

---

## 7. Mã lỗi theo endpoint

| Mã | `code` | slug-check | POST | GET list | GET :slug |
| --- | --- | :-: | :-: | :-: | :-: |
| `400` | `VALIDATION_ERROR` | ✔ (query) | ✔ | | |
| `401` | `UNAUTHENTICATED` | ✔ | ✔ | ✔ | ✔ |
| `403` | `PASSWORD_RESET_REQUIRED` | ✔ | ✔ | ✔ | ✔ |
| `403` | `ORIGIN_NOT_ALLOWED` | | ✔ | | |
| `404` | `NOT_FOUND` | | | | ✔ |
| `409` | `SLUG_ALREADY_EXISTS` *(mới)* | | ✔ | | |
| `429` | `TOO_MANY_ATTEMPTS` | ✔ | ✔ | | |

Không có `422` (Q2, A6).

---

## 8. Bảo mật (OWASP)

| Nhóm | Rủi ro ở tính năng này | Biện pháp |
| --- | --- | --- |
| A01 Broken Access Control | Đọc workspace mình không phải thành viên (IDOR qua slug) | `WorkspaceMemberGuard`, trả `404` chứ không trả `403`. Membership nằm ngay trong điều kiện `JOIN` của truy vấn (DB 4.5), không tách thành bước kiểm tra riêng |
| A01 Mass assignment | Tự gán `ownerId`, `role` | DTO whitelist + `forbidNonWhitelisted`. Owner lấy từ phiên. E2E test (mục 9.2, #6) |
| A03 Injection | Slug hoặc tên trong SQL | Chỉ dùng truy vấn có tham số. Regex đã chặn ký tự lạ trong slug |
| A04 Insecure design | Dùng lại slug cũ để hứng link của tổ chức khác (R2) | Slug không bao giờ được giải phóng (`UNIQUE` toàn bảng) |
| A05 Misconfiguration | Proxy cache danh sách workspace | `Cache-Control: no-store` |
| A07 Enumeration | Dò xem slug nào đã có người dùng | Bắt buộc đăng nhập, rate-limit (mục 6) |
| CSRF | Trang lạ khiến người dùng tự tạo workspace | Cookie `SameSite=Lax` + `OriginGuard` cho mọi `POST` (đã có) |
| A09 Logging | Lộ tên tổ chức trong log | Log chỉ có id và `organizationSize` |

---

## 9. Test

### 9.1 Unit (`workspaces.service.spec.ts`, `workspaceMemberGuard.spec.ts`, repository và rate limiter giả, `Clock` cố định)

- `create`: `created` → trả đúng hình response, `Location`, gọi log không kèm tên. `rate_limited` → `429` có `retryAfterSeconds`. `user_inactive` → `401`. `SlugAlreadyExistsError` → `409` có `fields.slug`.
- `create`: màu nền bằng `pickWorkspaceColor(id)`, và id truyền xuống repository là UUID hợp lệ.
- `slugCheck`: lần lượt từng `reason` (INVALID / RESERVED / TAKEN / null). Với INVALID và RESERVED, repository **không** được gọi.
- `InMemorySlugCheckRateLimiter`: request thứ 61 trong 60 giây bị chặn, `retryAfterSeconds` đúng. Sau khi khung thời gian trôi qua thì được gọi lại. Key bị xoá khi mảng mốc thời gian rỗng.
- `WorkspaceMemberGuard`: slug sai định dạng → `404` và không gọi repository. Không tìm thấy → `404`. Tìm thấy → gắn `request.workspace`.

### 9.2 E2E (`test/workspaces.e2e-spec.ts`, DB `_test`; nhớ sửa `TRUNCATE` theo DB mục 7)

| # | Kịch bản | Kỳ vọng |
| --- | --- | --- |
| 1 | Không cookie → 4 endpoint | `401` |
| 2 | Phiên chỉ-đổi-mật-khẩu → `POST` | `403 PASSWORD_RESET_REQUIRED` |
| 3 | `POST` hợp lệ | `201`. DB có 1 workspace + 1 member `owner`. `users.last_workspace_id` đúng. `timezone` = `user_timezone` |
| 4 | `POST` slug `admin`, `slug-check`, `Acme`, `ab`, `a--b` | `400`, `fields.slug` đúng câu lỗi |
| 5 | `POST` hai lần cùng slug, chạy song song | Một `201`, một `409`, chỉ có 1 dòng `workspace_members` |
| 6 | `POST` kèm `ownerId` / `role` | `400`, không có gì được tạo |
| 7 | 6 lần `POST` liên tiếp | Lần 6 nhận `429`, có header `Retry-After` |
| 8 | `POST` với `Origin` lạ | `403 ORIGIN_NOT_ALLOWED` |
| 9 | `GET /api/workspaces` của user có 2 workspace, một cái đã xoá mềm (sửa trực tiếp trong DB) | Chỉ trả 1 workspace. `lastWorkspaceSlug` là `null` nếu workspace gần nhất chính là cái đã xoá |
| 10 | `GET /:slug` của user B với workspace của A | `404`. Body giống hệt body khi slug không tồn tại |
| 11 | `GET /:slug` hợp lệ hai lần | `200`. Lần hai không ghi `users` (kiểm tra bằng `xmin` của dòng hoặc spy) |
| 12 | `slug-check` cho slug của workspace đã xoá mềm | `TAKEN` |
| 13 | Mọi response | Có `Cache-Control: no-store` và `X-Request-Id` |

---

## 10. Câu hỏi cần chốt (bổ sung)

| # | Câu hỏi | Đề xuất |
| --- | --- | --- |
| API1 | `GET /api/workspaces/slug-check` trùng tầng với `/:slug`. Thêm `slug-check` vào danh sách bảo lưu, hay đổi đường dẫn (ví dụ `GET /api/workspace-slugs/acme`)? | Giữ đường dẫn của requirement, **thêm `slug-check` vào danh sách bảo lưu** và khai báo route này trước `:slug`. Quy tắc chung: mọi segment tĩnh nằm cùng tầng với `:slug` dưới `/api/workspaces/` đều phải bảo lưu. Cập nhật BA 5.4 |
| API2 | Rate-limit `slug-check` in-memory (đúng trong một instance) có chấp nhận được không? | Có cho MVP (Q11). Đổi sang Redis khi chạy nhiều instance |
| API3 | Có nhận `durationMs` trong body `POST` để đo thời gian hoàn thành form (Q9) không? | **Không** đưa vào hợp đồng MVP: một field chỉ để đo lường làm DTO phức tạp hơn. Đo bằng test usability trước |
| API4 | Sinh `id` ở ứng dụng (`randomUUID()`) để chọn màu theo id? | Có. Hoặc băm theo slug nếu muốn giữ `DEFAULT` của DB. Kết quả tương đương vì slug cũng không đổi |
| API5 | Thêm Zod vào `@repo/contracts` để viết schema một lần cho cả web và API? | Chưa. Đây là dependency mới, phải hỏi trước. Bản TypeScript thuần đủ cho 3 field |
| API6 | `409` có `fields.slug` là ngoại lệ so với quy ước "`fields` chỉ có ở `VALIDATION_ERROR`". Có ghi lại thành quy ước chung không? | Có: "`fields` có thể xuất hiện ở mọi lỗi gắn với một ô cụ thể". Sửa login api-spec 2.1 |
| API7 | `GET /api/workspaces/:slug` có tác dụng phụ ghi `last_workspace_id` (Q12). Đồng ý không? | Đồng ý. Nếu muốn `GET` thuần đọc thì thêm `PUT /api/users/me/last-workspace` và web gọi khi đổi workspace |
