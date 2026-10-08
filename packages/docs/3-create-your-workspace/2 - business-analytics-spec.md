# Đặc tả nghiệp vụ: Tạo Workspace (Create Workspace)

- **Nguồn:**
  - [`1 - requirement.md`](./1%20-%20requirement.md): yêu cầu gốc. File này **phân tích lại và chốt** yêu cầu đó, không thay thế nó.
  - Draft UI: [`create-your-workspace-1.png`](./create-your-workspace-1.png) (form), [`create-your-workspace-2.png`](./create-your-workspace-2.png) (dropdown quy mô), [`create-your-workspace-3.png`](./create-your-workspace-3.png) (Workspace Switcher).
  - Schema: [`sample-workspace.sql`](./sample-workspace.sql) (bản đã chốt theo mục 6, xem chi tiết ở `3 - database-spec.md`).
  - Hiện trạng code (ngày 2026-10-08): migration `CreateAuthTables`, `AuthModule` (đã có `SessionGuard`, `@CurrentUserId()`), `UsersModule` (profile), web routes trong [routes.tsx](../../../apps/web/src/routes.tsx).
  - Quy ước API chung: [`../1-login-page/api-spec.md`](../1-login-page/api-spec.md) mục 2 (định dạng lỗi, request ID). File này không nhắc lại.
- **Trạng thái:** bản nháp, chờ chốt các câu hỏi ở mục 12.
- **Phạm vi:** người dùng đã đăng nhập tạo workspace mới (lần đầu sau khi đăng nhập, hoặc tạo thêm từ Workspace Switcher), kiểm tra slug theo thời gian thực, gán người tạo làm owner, chuyển qua lại giữa các workspace.
- **Ngoài phạm vi:** upload logo, mời thành viên, danh sách lời mời, trang Settings của workspace, xoá hoặc chuyển giao workspace, billing, custom domain, SSO.

---

## 0. Tóm tắt kết quả phân tích

Requirement gốc đầy đủ về ý đồ. Khi đối chiếu với code và schema hiện có thì có **10 điểm cần chỉnh** trước khi code:

| # | Điểm trong requirement | Vấn đề | Đề xuất |
| --- | --- | --- | --- |
| A1 | `workspace_members.role DEFAULT 'owner'` | Default nguy hiểm: sau này code mời thành viên quên truyền `role` thì người được mời thành **owner** | Default `'member'`. Service luôn truyền `role` tường minh |
| A2 | Vừa `slug UNIQUE`, vừa unique index `lower(slug) WHERE deleted_at IS NULL` | Hai ràng buộc mâu thuẫn. `UNIQUE` toàn bảng đã chặn dùng lại slug của workspace đã xoá, nên partial index vô nghĩa | Chỉ giữ `UNIQUE (slug)`. **Không bao giờ dùng lại slug** (R2). Regex đã bắt chữ thường nên không cần `lower()` |
| A3 | `logo_asset_id REFERENCES file_assets` | Bảng `file_assets` chưa tồn tại, migration sẽ lỗi | Chưa tạo cột này. Thêm khi có module lưu trữ file |
| A4 | Bước 4 transaction: ghi `last_workspace_id` | Bảng `users` **không có** cột này (đã kiểm tra DB) | Thêm cột `users.last_workspace_id` trong cùng migration (mục 6.3) |
| A5 | Lỗi `401 UNAUTHORIZED`, `403 FORBIDDEN` | Code đang dùng `UNAUTHENTICATED`, `PASSWORD_RESET_REQUIRED`, `ORIGIN_NOT_ALLOWED` | Dùng mã hiện có. Chỉ thêm mã mới `SLUG_ALREADY_EXISTS` |
| A6 | `422 SLUG_RESERVED` riêng, trong khi slug sai định dạng là `400` | Hai luật tĩnh lại trả hai mã khác nhau. Dự án chưa dùng `422` ở đâu | Slug bị bảo lưu trả `400 VALIDATION_ERROR` với `fields.slug` (Q2) |
| A7 | Switcher hiện người tạo là **"Admin"** | Draft ghi "Admin" cho người tạo, trong khi requirement gán `role = 'owner'`. Nhãn và dữ liệu lệch nhau | Hiện **"Owner"** cho đúng dữ liệu (Q1) |
| A8 | Danh sách slug bảo lưu | Thiếu các route web đang có: `set-password`, `forgot-password`. Các mục có dấu chấm (`favicon.ico`…) không bao giờ khớp regex nên thừa | Cập nhật danh sách ở mục 5.4, kèm luật bắt buộc cập nhật khi thêm route cấp 1 |
| A9 | Prefix ô URL là `localhost:8080/` | Web chạy ở `:5173`. Prefix phải lấy từ host thực tế | Dùng `window.location.host + "/"` |
| A10 | "Người dùng mới **đăng ký** được dẫn thẳng vào tạo workspace" | OpenPlany **chưa có đăng ký**. User được tạo bằng CLI `user:create` | Người dùng **đăng nhập mà chưa có workspace nào** ở lại trang chủ trống `/`, head bar có nút **Create workspace +** (mục 3.1, 4.3) |

Ngoài ra, requirement **thiếu** endpoint đọc một workspace theo slug (`GET /api/workspaces/:slug`). Route `/:workspaceSlug` cần endpoint này để biết người dùng có quyền vào hay không (mục 7.4).

---

## 1. Mục tiêu và tiêu chí thành công

| Mục tiêu | Tiêu chí đo | Cách đo |
| --- | --- | --- |
| Tạo workspace nhanh, không vướng | p50 từ lúc mở form tới lúc nhận `201` ≤ 30 giây. Ít nhất 90% người dùng tạo được ngay lần submit đầu tiên | Log `workspace.created` có `durationMs` do client gửi lên (Q9). Trước khi có số liệu: test usability với 5 người |
| API đủ nhanh | `POST /api/workspaces` p95 < 400 ms. `GET /slug-check` p95 < 150 ms | Log thời gian theo request ID |
| Slug luôn hợp lệ và duy nhất | 0 bản ghi vi phạm regex, trùng slug, hay trúng từ bảo lưu | Ràng buộc ở DB (`UNIQUE`, `CHECK`) và test ở service |
| Người tạo luôn là owner | 100% workspace có đúng một member `owner` và người đó trùng `owner_id` | Ghi cả hai trong một transaction. Có query kiểm tra trong e2e |
| Không lộ dữ liệu giữa các workspace | Người không phải thành viên gọi `/:slug` nhận `404` | E2E test |

---

## 2. Người dùng và điểm vào

| Tình huống | Người dùng | Điểm vào | Nút "Go back" |
| --- | --- | --- | --- |
| **Chưa có workspace** | Đã đăng nhập, **chưa thuộc workspace nào** | Đăng nhập xong vào trang chủ trống `/`, bấm nút **Create workspace +** trên head bar (mục 4.3) | Về `/` |
| **Tạo thêm** | Đã thuộc ≥ 1 workspace | Switcher → "Create workspace" | Quay về trang trước (`navigate(-1)`). Mở thẳng URL (không có lịch sử) thì về `/`, để luật 3.1 chọn workspace |

Ai được tạo workspace: mọi tài khoản đang active có phiên đầy đủ. Phiên chỉ-đổi-mật-khẩu thì `SessionGuard` đã trả `403 PASSWORD_RESET_REQUIRED`. Có cần cờ cấp hệ thống để chỉ admin hệ thống mới được tạo workspace không: Q6.

---

## 3. Luồng nghiệp vụ

### 3.1 Điều hướng sau khi đăng nhập (thay đổi `sessionDestination`)

```text
Đăng nhập thành công
  ├─ requiresPasswordReset ──────────────► /set-password          (giữ nguyên)
  └─ GET /api/workspaces
       ├─ 0 workspace ──────────────────► ở lại /: trang chủ trống + nút "Create workspace +" (4.3)
       ├─ lastWorkspaceSlug còn trong DS ► /:lastWorkspaceSlug
       └─ còn lại ──────────────────────► /:slug của workspace đầu tiên (theo tên A→Z)
```

Route `/` (HomePage hiện tại) trở thành route điều hướng theo luật trên. Chỉ người **chưa có workspace** mới ở lại trang này. **Không** tự động đẩy họ sang `/create-workspace`: người dùng có thể chỉ vừa được cấp tài khoản và đang chờ được mời vào một workspace có sẵn, nên để họ tự quyết định có tạo workspace mới hay không.

### 3.2 Tạo workspace

```text
Mở /create-workspace
  │ gõ Name ──► (slug chưa sửa tay) tự sinh slug ──► debounce 300 ms ──► GET /slug-check
  │ sửa Slug tay ──► ngừng tự sinh ──────────────► debounce 300 ms ──► GET /slug-check
  │ chọn Organization size
  ▼
"Create workspace" (bật khi 3 ô hợp lệ VÀ slug không bị báo là đã dùng/bảo lưu)
  ▼
POST /api/workspaces
  ├─ 201 ──► thêm vào danh sách workspace (WorkspaceContext) ──► navigate(/:slug, replace)
  ├─ 400 ──► lỗi dưới từng ô theo `fields`
  ├─ 409 SLUG_ALREADY_EXISTS ──► lỗi dưới ô URL, focus vào ô URL (có người vừa lấy mất)
  ├─ 429 ──► Alert "You've created several workspaces recently. Try again in N minutes."
  └─ 401 ──► về /sign-in | 5xx/mất mạng ──► Alert, giữ dữ liệu đã nhập
```

### 3.3 Chuyển workspace

Bấm một workspace trong Switcher thì `navigate(/:slug)`. Trang workspace gọi `GET /api/workspaces/:slug`. Server trả `200` và **cập nhật `last_workspace_id`** (mục 7.4). Không cần endpoint riêng cho việc "chuyển".

---

## 4. Đọc draft UI

### 4.1 Form tạo (ảnh 1, 2)

| Phần tử | Ghi chú nghiệp vụ |
| --- | --- |
| Tiêu đề "Create your workspace" | `Title order={1}`. Draft căn trái, rộng ~680px. Dùng trang riêng, **không** dùng popup: form và các thông báo cần đủ chỗ, nhất là trên mobile |
| Name your workspace `*` | Placeholder là câu gợi ý ("Something familiar…"). Placeholder biến mất khi gõ, nên nếu cần gợi ý lâu dài thì đưa vào `description` |
| Set your workspace's URL `*` | Prefix là phần **chỉ đọc** nằm trong ô (Mantine `leftSection` hoặc text nối liền), lấy từ `window.location.host`. Prefix dài trên mobile thì cắt bớt bằng `…` ở đầu |
| — (draft thiếu) | Cần thêm: dòng trạng thái slug ("✓ Available" / lỗi) đọc bằng `aria-live="polite"`, và `description` cố định "You can't change this URL later." (luật 5.5) |
| How many people… `*` | Mantine `Select`, 6 lựa chọn đúng thứ tự của ảnh 2. Không cho gõ để tìm (`searchable=false`) |
| "Create workspace" | Mờ khi chưa hợp lệ (như nút Sign in). Khi gửi: `loading`, khoá cả form |
| "Go back" | `variant="default"`. Luôn hiện. Về trang trước, hoặc về `/` (mục 2) |
| Không có ô logo, timezone | Đúng phạm vi: timezone lấy từ người tạo, logo là chữ cái đầu |

### 4.2 Workspace Switcher (ảnh 3)

| Phần tử | Ghi chú nghiệp vụ |
| --- | --- |
| Trigger: logo vuông + tên + chevron | Đặt ở góc trái `AppHeader`, thay cho mark OpenPlany hiện tại. Là một `button` có `aria-haspopup="menu"`. Tên dài thì cắt `…` |
| Logo chữ cái | Mantine `Avatar radius="sm"`, chữ cái đầu viết hoa của tên. Màu nền lấy từ `background_color` (Q5) |
| Email ở đầu menu | Lấy từ `AuthContext`, màu dimmed |
| Workspace hiện tại: nền nhạt, `✓` | Workspace hiện tại = slug trên URL, **không** lấy từ server (requirement có cờ `isActive`, đề xuất bỏ) |
| Dòng phụ "Admin • 1 Member" | Vai trò hiển thị theo Q1. Số nhiều: "1 member" / "5 members" |
| Nút "Settings", "Invite members" | Tính năng chưa có. **Ẩn** trong đợt này (Q4) |
| Danh sách workspace khác | Sắp theo tên A→Z. Hơn 8 mục thì danh sách cuộn trong menu |
| "Create workspace" | → `/create-workspace` |
| "Workspace invites" | Chưa có bảng lời mời. **Ẩn** (Q4) |
| "Sign out" (đỏ) | Gọi `signOut()` có sẵn. Nút "Sign out" đang nằm trên header thì chuyển vào đây để không có hai nút trùng nhau |

### 4.3 Head bar khi chưa có workspace (bổ sung, không có trong draft)

Người chưa thuộc workspace nào vẫn thấy head bar ở trang `/`. Vị trí của Workspace Switcher được thay bằng nút **Create workspace +**:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ [logo]  [ Create workspace + ]                [◐] [(K) Kai Tran] [Sign out] │
└──────────────────────────────────────────────────────────────────────┘
```

| Yêu cầu | Lý do |
| --- | --- |
| Nút chỉ hiện khi **danh sách workspace đã tải xong và rỗng** | Đang tải mà hiện rồi biến mất sẽ gây chớp. Đã có workspace thì tạo thêm qua Switcher (4.2), không cần nút riêng |
| Bấm nút → `/create-workspace` | Cùng một form với luồng tạo thêm |
| Là **link** (điều hướng), không phải nút hành động | Mở được trong tab mới, screen reader đọc đúng vai trò |
| Màn hẹp (< 576px): chỉ hiện icon `+`, có `aria-label="Create workspace"` | Head bar 375px không đủ chỗ cho cả nhãn, toggle, avatar và Sign out |
| Nút **"Sign out" vẫn nằm trên head bar** ở trạng thái này | Chưa có Switcher nên chưa có menu chứa Sign out |
| Thân trang: tiêu đề "You're not in a workspace yet", câu "Create one to start planning, or ask your admin to invite you.", kèm một nút "Create workspace" | Trang không để trống. Câu này cũng nhắc người đang chờ lời mời rằng họ không cần tạo |

---

## 5. Luật nghiệp vụ

### 5.1 Kiểm tra dữ liệu

Server là nguồn chuẩn (DTO class-validator). Client kiểm tra **cùng luật** để báo lỗi sớm. Mọi chuỗi đi qua `.normalize('NFC').trim()` trước khi kiểm tra, giống profile.

| Trường | Luật | Câu lỗi (`fields.<field>`) |
| --- | --- | --- |
| `name` | Bắt buộc, 1–80 ký tự sau trim | "Enter a workspace name" / "Workspace name must be 80 characters or fewer" |
| `name` | Không chứa ký tự điều khiển hay vô hình: `/^[^\p{Cc}\p{Cf}]*$/u` | "Contains characters that aren't allowed" |
| `name` | Không chứa `://` hoặc bắt đầu bằng `www.` (chống tên giả làm link trong email mời sau này) | "Workspace name cannot contain a URL" |
| `slug` | Bắt buộc, 3–48 ký tự (Q3) | "Enter a workspace URL" / "URL must be between 3 and 48 characters" |
| `slug` | `^[a-z0-9]+(?:-[a-z0-9]+)*$`. Regex này đã loại sẵn `-` ở đầu/cuối và `--` liên tiếp | "URL can use only lowercase letters, numbers, and single hyphens, and can't start or end with a hyphen" |
| `slug` | Không thuộc danh sách bảo lưu (5.4) | "This URL is reserved. Choose another one." |
| `slug` | Chưa workspace nào dùng, **kể cả workspace đã xoá mềm** | "This URL is already taken. Choose another one." |
| `organizationSize` | Bắt buộc, thuộc `Just myself`, `2-10`, `11-50`, `51-200`, `201-500`, `500+` | "Select how many people will use this workspace" |
| Trường khác | `forbidNonWhitelisted` trả `400`. Client **không** được gửi `ownerId`, `role`, `timezone`… | — |

Tên workspace **không cần duy nhất**: hai tổ chức khác nhau có thể trùng tên. Switcher hiện slug trong `title` (tooltip) để phân biệt.

### 5.2 Tự sinh slug từ tên

Thuật toán dùng chung cho web (sinh gợi ý) và API (test). Đặt trong package dùng chung (Q8):

1. `normalize('NFKD')`, đổi `đ/Đ` thành `d` (NFKD **không** tách được `đ`), bỏ dấu (`\p{M}`).
2. `toLowerCase()`.
3. Mọi chuỗi ký tự không thuộc `[a-z0-9]` → một dấu `-`.
4. Bỏ `-` ở đầu và cuối.
5. Cắt còn 48 ký tự, rồi bỏ `-` ở cuối nếu có.

| Tên nhập | Slug sinh ra |
| --- | --- |
| `OpenPlany Dev Team` | `openplany-dev-team` |
| `Công ty Đầu tư Ánh Dương` | `cong-ty-dau-tu-anh-duong` |
| `  Acme & Co.  ` | `acme-co` |
| `R&D__Team--2026` | `r-d-team-2026` |
| `株式会社` hoặc `🚀🚀` | *(rỗng)*: ô URL để trống, người dùng phải tự gõ |
| `Admin` | `admin`: sinh ra bình thường, rồi bị báo lỗi bảo lưu ngay |

**Hành vi khi gõ:**

- Ô URL còn **"pristine"** (chưa sửa tay) thì luôn đồng bộ theo tên. Người dùng gõ vào ô URL thì ngừng đồng bộ. Xoá trống ô URL thì đồng bộ trở lại.
- Khi gõ tay vào ô URL, chỉ đổi chữ hoa thành chữ thường và khoảng trắng thành `-` ngay lúc gõ. **Không** bỏ `-` ở cuối khi đang gõ, nếu không người dùng không gõ được `acme-team`. Lỗi định dạng chỉ hiện khi rời ô hoặc khi submit.
- **Dán URL đầy đủ** (placeholder là "Type or paste a URL"): nếu nội dung dán vào có `/`, chỉ lấy đoạn path **cuối cùng** khác rỗng (`https://app.openplany.dev/acme/` → `acme`).

### 5.3 Kiểm tra slug theo thời gian thực

- Gọi `GET /api/workspaces/slug-check` sau khi **ngừng gõ 300 ms**. Chỉ gọi khi slug đã qua kiểm tra định dạng ở client. Huỷ request cũ (`AbortController`) và bỏ qua kết quả trả về không theo thứ tự.
- Hiển thị: đang kiểm tra (loader nhỏ), `✓ Available` (màu success), hoặc câu lỗi ở 5.1.
- Nếu **chính request kiểm tra bị lỗi** (mạng, 5xx): **không** khoá nút tạo. Server vẫn là nơi kiểm tra cuối cùng (luật 5.6).
- Kết quả "available" chỉ đúng tại thời điểm hỏi. Hai người cùng submit một slug thì người sau nhận `409` (mục 3.2).

### 5.4 Slug bảo lưu

Web dùng route cấp 1 dạng `/:workspaceSlug`, nên **mọi route cấp 1 của web và mọi tiền tố hệ thống** đều phải bảo lưu.

```text
# Route web hiện có / sắp có
sign-in, sign-out, sign-up, set-password, forgot-password, reset-password,
create-workspace, onboarding, invitations, invite, profile, settings, accounts

# Hạ tầng & tài nguyên tĩnh (slug-check: segment tĩnh cùng tầng với /api/workspaces/:slug, xem 4 - api-spec API1)
slug-check, api, assets, static, public, cdn, graphql, webhook, webhooks, oauth, auth,
health, status, ping, robots, sitemap, favicon

# Thương hiệu & thuật ngữ hệ thống
admin, administrator, app, billing, bot, config, console, dashboard, dev, docs,
error, help, home, jobs, legal, login, logout, new, notifications, org, pricing,
privacy, root, security, support, sys, system, terms, user, users, workspace,
workspaces, openplany, instance
```

- So khớp **chính xác** (`admin` bị chặn, `admin-team` thì không). Muốn chặn theo tiền tố thì phải ghi rõ: Q7.
- **Quy tắc bắt buộc:** PR nào thêm route cấp 1 mới ở web thì phải thêm route đó vào danh sách này. Thêm mục vào checklist review trong CLAUDE.md.
- Workspace đã tồn tại trước khi slug của nó bị đưa vào danh sách thì vẫn dùng bình thường. Route tĩnh cần được khai báo **trước** `/:workspaceSlug` trong router.

### 5.5 Slug không đổi được

Slug là một phần của mọi đường dẫn bên trong workspace (`/:slug/projects/...`), cũng như link trong email, bookmark và webhook. Đổi slug sẽ làm hỏng tất cả những link đó. Vì vậy:

- `PATCH` workspace sau này **không nhận** `slug`.
- Form tạo có dòng `description` cố định dưới ô URL: *"You can't change this URL later."*
- Tên workspace thì đổi được (trong Settings, ngoài phạm vi đợt này).

### 5.6 Khởi tạo trong một transaction

```text
BEGIN
  1. Kiểm tra lại: định dạng + bảo lưu (DTO) ─ trùng thì để DB bắt (bước 2)
  2. INSERT workspaces (name, slug, organization_size, timezone = users.user_timezone,
                        background_color, owner_id = created_by_id = updated_by_id = currentUser)
       └─ vi phạm UNIQUE (23505 trên slug) ──► ROLLBACK ──► 409 SLUG_ALREADY_EXISTS
  3. INSERT workspace_members (workspace_id, member_id = currentUser, role = 'owner')
  4. UPDATE users SET last_workspace_id = <id mới> WHERE id = currentUser
COMMIT ──► log `workspace.created` { userId, workspaceId, organizationSize, requestId }
```

- **Không** chạy `SELECT` kiểm tra trùng trước khi `INSERT`. Để ràng buộc `UNIQUE` của DB quyết định là cách duy nhất không bị race condition.
- Không có HTTP call hay seed dữ liệu mẫu trong transaction (Q10).
- Log **không** ghi tên workspace hay slug (tên có thể chứa tên khách hàng hoặc tên người).

### 5.7 Vai trò và bất biến

| Vai trò | Quyền (định hướng, đa số dùng ở các tính năng sau) |
| --- | --- |
| `owner` | Mọi quyền. Duy nhất được xoá workspace, chuyển giao quyền sở hữu, billing |
| `admin` | Cài đặt workspace, mời/xoá thành viên |
| `member` | Làm việc với project/issue |
| `guest` | Xem và bình luận trong phạm vi được chia sẻ |

**Bất biến:** mỗi workspace có **đúng một** member `role = 'owner'` đang active, và người đó là `workspaces.owner_id`. Đợt này chỉ có luồng tạo nên bất biến tự đúng. Khi làm chuyển giao quyền sở hữu thì phải cập nhật cả hai trong một transaction.

### 5.8 Giới hạn tần suất

- Tạo: tối đa **5 workspace / 1 giờ / người dùng**. Đếm bằng `SELECT count(*) FROM workspaces WHERE created_by_id = $1 AND created_at > now() - interval '1 hour'` (có index, mục 6.1), không cần thư viện mới. Vượt quá thì trả `429 TOO_MANY_ATTEMPTS` kèm `retryAfterSeconds`.
- `slug-check`: tối đa 60 request/phút/người dùng (Q11). Endpoint này để lộ việc một slug đã có người dùng hay chưa. Mức rủi ro thấp (đa số sản phẩm cùng loại cũng để lộ thông tin này) vì phải đăng nhập mới gọi được, nhưng vẫn cần chặn việc dò hàng loạt.
- Không giới hạn tổng số workspace mỗi người.

### 5.9 Phân tách dữ liệu giữa các workspace

- Mọi endpoint dưới `/api/workspaces/:slug/...` phải kiểm tra **membership** (`is_active = true`, workspace chưa xoá). Không đủ điều kiện thì trả `404 NOT_FOUND`, **không** trả `403`, để không xác nhận workspace đó tồn tại.
- Đợt này mới có `GET /api/workspaces/:slug`. Đặt logic kiểm tra thành `WorkspaceMemberGuard` dùng lại được cho các tính năng sau.

---

## 6. Mô hình dữ liệu (đề xuất cho migration `CreateWorkspaceTables`)

### 6.1 `workspaces`

```sql
CREATE TABLE workspaces (
    id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    name              varchar(80)  NOT NULL,
    slug              varchar(48)  NOT NULL CONSTRAINT workspaces_slug_key UNIQUE,      -- A2: không dùng lại slug
    logo              text,                                                             -- URL, chưa dùng (A3)
    owner_id          uuid         NOT NULL REFERENCES users (id),
    created_by_id     uuid         REFERENCES users (id),
    updated_by_id     uuid         REFERENCES users (id),
    organization_size varchar(20)  NOT NULL
        CONSTRAINT chk_workspaces_org_size
        CHECK (organization_size IN ('Just myself','2-10','11-50','51-200','201-500','500+')),
    timezone          varchar(255) NOT NULL DEFAULT 'UTC',
    background_color  varchar(7)   NOT NULL,                                            -- '#RRGGBB', Q5
    created_at        timestamptz  NOT NULL DEFAULT now(),
    updated_at        timestamptz  NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    CONSTRAINT chk_workspaces_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE INDEX idx_workspaces_created_by_recent ON workspaces (created_by_id, created_at);  -- luật 5.8
```

Khác với requirement (mục 4):

- `organization_size` là `NOT NULL` và có `CHECK`, vì form bắt buộc chọn.
- Có `CHECK` định dạng slug, phòng trường hợp dữ liệu được ghi không qua API.
- Chưa có `logo_asset_id` (A3).
- `background_color` là `varchar(7)` thay vì `255`.
- **Không** khai báo FK `DEFERRABLE INITIALLY DEFERRED`: transaction ở 5.6 chèn theo đúng thứ tự, không cần hoãn kiểm tra FK.

### 6.2 `workspace_members`

```sql
CREATE TABLE workspace_members (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    member_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role         varchar(20) NOT NULL DEFAULT 'member',                                 -- A1
    is_active    boolean     NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_workspace_member UNIQUE (workspace_id, member_id),
    CONSTRAINT chk_workspace_member_role CHECK (role IN ('owner','admin','member','guest'))
);
CREATE INDEX idx_workspace_members_member_active ON workspace_members (member_id) WHERE is_active;
```

- **Role là chuỗi, không phải mã số.** Chuỗi dễ đọc hơn khi debug, và `CHECK` vẫn khoá chặt tập giá trị.
- `ON DELETE CASCADE` trên `member_id`: user hiện chỉ bị vô hiệu hoá (`is_active`), không bị xoá, nên cascade gần như không bao giờ chạy. Giữ để không còn bản ghi thành viên trỏ tới user đã bị xoá.

### 6.3 `users.last_workspace_id` (cột mới)

```sql
ALTER TABLE users ADD COLUMN last_workspace_id uuid
    REFERENCES workspaces (id) ON DELETE SET NULL;
```

Cột này được ghi khi tạo workspace (5.6) và khi mở một workspace (7.4). Được dùng ở luật điều hướng 3.1. Entity `User` cần map thêm cột này.

---

## 7. Hợp đồng API

Mọi endpoint đều gắn `@UseGuards(SessionGuard)`. Request có `Origin` lạ thì `OriginGuard` toàn cục trả `403 ORIGIN_NOT_ALLOWED`. JSON dùng camelCase. Lỗi theo định dạng `ApiErrorBody` hiện có.

**Mã lỗi mới** cần thêm vào `API_ERROR_CODES`: `SLUG_ALREADY_EXISTS`. Các mã khác đã có sẵn.

### 7.1 `GET /api/workspaces/slug-check?slug=acme`

```jsonc
// 200 — luôn là 200, kể cả khi không dùng được
{ "slug": "acme", "available": false, "reason": "TAKEN" }   // reason: "INVALID" | "RESERVED" | "TAKEN" | null
```

- `slug` thiếu hoặc dài hơn 100 ký tự thì trả `400 VALIDATION_ERROR` (chặn query rác). Còn lại, sai định dạng là `reason: "INVALID"`.
- Workspace đã xoá mềm vẫn tính là `TAKEN` (luật 5.1).
- Response có header `Cache-Control: no-store`.

### 7.2 `POST /api/workspaces`

```jsonc
// Request
{ "name": "Acme Corporation", "slug": "acme-corp", "organizationSize": "11-50" }

// 201 — cùng hình với một phần tử của 7.3, để web ghi thẳng vào WorkspaceContext
{ "id": "e4b2…", "name": "Acme Corporation", "slug": "acme-corp", "logoUrl": null,
  "backgroundColor": "#0F172A", "organizationSize": "11-50", "timezone": "Asia/Ho_Chi_Minh",
  "role": "owner", "memberCount": 1, "createdAt": "2026-10-08T14:30:00.000Z" }
```

| Mã | `code` | Khi nào |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Sai luật 5.1, gồm cả slug bảo lưu (A6). Kèm `fields` |
| `401` | `UNAUTHENTICATED` | Không có phiên, hoặc tài khoản không còn active / đã bị mask |
| `403` | `PASSWORD_RESET_REQUIRED` | Phiên chỉ-đổi-mật-khẩu |
| `403` | `ORIGIN_NOT_ALLOWED` | `Origin` lạ |
| `409` | `SLUG_ALREADY_EXISTS` | Trùng slug, kể cả khi hai request chạy đồng thời. Kèm `fields.slug` |
| `429` | `TOO_MANY_ATTEMPTS` | Vượt luật 5.8. Kèm `retryAfterSeconds` |

Header `Location: /api/workspaces/acme-corp`.

### 7.3 `GET /api/workspaces`

```jsonc
// 200 — các workspace mà user là thành viên active, workspace chưa xoá, sắp theo tên A→Z
{
  "workspaces": [
    { "id": "…", "name": "OpenPlany", "slug": "openplany", "logoUrl": null,
      "backgroundColor": "#0F172A", "role": "owner", "memberCount": 1 }
  ],
  "lastWorkspaceSlug": "openplany"   // null nếu chưa có hoặc user không còn là thành viên
}
```

- Response dùng **object bọc ngoài** thay vì mảng trơn như requirement, để thêm `lastWorkspaceSlug` và sau này thêm phân trang mà không phá hợp đồng.
- Bỏ cờ `isActive` của requirement: workspace hiện tại do URL quyết định (mục 4.2).
- `memberCount` lấy bằng `COUNT(*) FILTER (WHERE is_active)` trong cùng một query (`GROUP BY`), không gây N+1.

### 7.4 `GET /api/workspaces/:slug` (requirement chưa có)

- Guard: `SessionGuard` + `WorkspaceMemberGuard` (luật 5.9).
- `200`: cùng hình với 7.2. Đồng thời cập nhật `users.last_workspace_id`, nhưng **chỉ khi giá trị thay đổi**, để tránh ghi DB ở mỗi lần tải trang.
- `404 NOT_FOUND`: slug không tồn tại, workspace đã xoá, hoặc user không phải thành viên.

> Một `GET` lại ghi `last_workspace_id`: đây là tác dụng phụ có chủ ý, an toàn vì idempotent và chỉ ảnh hưởng chính người gọi. Nếu muốn giữ `GET` thuần đọc thì tách thành `PUT /api/users/me/last-workspace` (Q12).

---

## 8. Khoảng trống hiện tại

| Hạng mục | Hiện có | Cần làm |
| --- | --- | --- |
| DB | Bảng `users`, `sessions`, `login_attempts` | Migration `CreateWorkspaceTables` (6.1–6.3), kèm `down()` |
| API module | `AuthModule` (có `SessionGuard`, `@CurrentUserId()`), `UsersModule` | `workspaces/`: entities, `WorkspacesRepository`, `WorkspacesService`, `WorkspacesController`, DTO, `WorkspaceMemberGuard` |
| Transaction | Chưa có chỗ nào dùng | `DataSource.transaction()` trong repository. Service không đụng trực tiếp ORM |
| Mã lỗi | 10 mã | Thêm `SLUG_ALREADY_EXISTS`. Map lỗi PG `23505` (constraint `workspaces_slug_key`) thành mã này |
| Luật dùng chung | — | Regex slug, danh sách bảo lưu, quy mô tổ chức, `slugify()` cần dùng ở **cả** API và web. Theo CLAUDE.md thì đặt trong `packages/` (Q8) |
| Web routing | `/`, `/sign-in`, `/set-password`, `/forgot-password`, `*` → `/` | `/create-workspace`, `/:workspaceSlug/*`. Sửa `sessionDestination` theo 3.1. `*` hiện chuyển về `/`, cần đổi để slug lạ ra trang 404 thay vì quay về `/` |
| Web state | `AuthContext` | `WorkspaceContext` (danh sách + `refresh()` + `add(workspace)`). Server state nên dùng TanStack Query nhưng đây là dependency mới, **phải hỏi trước** |
| UI | `AppHeader` có mark + `UserButton` + Sign out | `CreateWorkspacePage`, `WorkspaceSwitcher` (thay mark, chứa Sign out), nút **Create workspace +** và trang chủ trống khi chưa có workspace (4.3) |
| CLI dev | `user:create` | Không bắt buộc: `workspace:create <ownerEmail> <name> <slug>` để seed nhanh |

---

## 9. Tiêu chí nghiệm thu

**Form và slug**

1. **Given** đang ở `/create-workspace`, **when** gõ tên `OpenPlany Dev Team`, **then** ô URL hiện `openplany-dev-team`, khoảng 300 ms sau hiện `✓ Available`.
2. **Given** tên `Công ty Đầu tư Ánh Dương`, **then** slug là `cong-ty-dau-tu-anh-duong`.
3. **Given** đã tự sửa ô URL thành `acme`, **when** sửa tiếp tên, **then** ô URL vẫn là `acme`.
4. **Given** slug `admin`, **then** hiện "This URL is reserved…" và nút tạo bị khoá. **Given** slug của một workspace đã có, **then** hiện "This URL is already taken…".
5. **Given** dán `https://app.openplany.dev/acme/` vào ô URL, **then** ô có giá trị `acme`.
6. **Given** slug `-acme`, `acme--team` hoặc `ab`, **then** báo lỗi định dạng hoặc độ dài khi rời ô, nút tạo bị khoá.
7. **Given** request `slug-check` lỗi mạng, **then** nút tạo vẫn bật được khi 3 ô hợp lệ.

**Tạo**

8. **Given** form hợp lệ, **when** bấm "Create workspace", **then** nút loading, form bị khoá, nhận `201`, điều hướng tới `/:slug`, và trong DB có đúng 1 dòng `workspaces` + 1 dòng `workspace_members` (`role = 'owner'`, `member_id = owner_id`), `users.last_workspace_id` = workspace mới, `workspaces.timezone` = `users.user_timezone`.
9. **Given** hai request `POST` cùng slug gửi đồng thời, **then** một nhận `201`, một nhận `409 SLUG_ALREADY_EXISTS`, và không có bản ghi `workspaces` hay `workspace_members` nào bị bỏ lại không có cặp.
10. **Given** body gửi kèm `"ownerId"` hoặc `"role": "owner"`, **then** `400`, không có gì được tạo.
11. **Given** đã tạo 5 workspace trong giờ qua, **when** tạo cái thứ 6, **then** `429` kèm `retryAfterSeconds`.
12. **Given** không có cookie phiên, **then** cả 4 endpoint trả `401`. **Given** phiên chỉ-đổi-mật-khẩu, **then** `403 PASSWORD_RESET_REQUIRED`.

**Điều hướng và Switcher**

13. **Given** user chưa thuộc workspace nào, **when** đăng nhập, **then** ở trang chủ trống `/`, head bar có nút **Create workspace +** và nút Sign out. Bấm nút thì tới `/create-workspace`; "Go back" đưa về `/`.
14. **Given** user thuộc `OpenPlany` (đã mở gần nhất) và `OpenStudy`, **when** đăng nhập, **then** vào `/openplany`.
15. **Given** đang ở `/openplany`, **when** mở Switcher, **then** thấy email, `OpenPlany` có `✓`, `OpenStudy`, "Create workspace", "Sign out". Không thấy "Settings", "Invite members", "Workspace invites" (Q4). Menu dùng được hoàn toàn bằng bàn phím.
16. **Given** user không phải thành viên của `acme`, **when** mở `/acme` hoặc gọi `GET /api/workspaces/acme`, **then** nhận trang/`404`, không phải `403`.
17. **Given** user đã có ít nhất một workspace, **then** head bar **không** có nút Create workspace + (tạo thêm qua Switcher). Trong lúc danh sách đang tải, nút cũng không hiện.
18. **Given** màn hình rộng 375px, **then** form một cột, prefix URL được cắt gọn, không cuộn ngang. Cả form và Switcher hiển thị đúng ở chế độ sáng và tối.

---

## 10. Ngoài phạm vi (backlog)

Upload logo (cần `file_assets`), Settings workspace (đổi tên, timezone, màu), mời thành viên và danh sách lời mời, xoá mềm và khôi phục workspace, chuyển giao quyền sở hữu, project mẫu khi tạo (Q10), cờ hệ thống chặn người dùng tự tạo workspace (Q6), Teamspace.

---

## 11. Rủi ro

| # | Rủi ro | Mức | Giảm thiểu |
| --- | --- | --- | --- |
| R1 | Race condition hai người cùng lấy một slug | Trung bình | `UNIQUE` ở DB là trọng tài duy nhất. Map `23505` thành `409`. AC #9 |
| R2 | **Dùng lại slug** của workspace đã xoá: link cũ, webhook, email mời trỏ vào tổ chức mới, dữ liệu gửi nhầm người | Cao | Không bao giờ giải phóng slug (A2) |
| R3 | Slug chiếm route web tương lai (`/projects`, `/new`…), khiến route mới không truy cập được | Trung bình | Danh sách bảo lưu rộng (5.4), checklist PR. Route tĩnh khai báo trước `/:workspaceSlug` |
| R4 | Mass assignment: client tự gán `ownerId`, `role` | Cao | DTO whitelist + `forbidNonWhitelisted`. Service tự lấy user từ phiên. AC #10 |
| R5 | Lộ sự tồn tại của workspace qua `403`/`404` khác nhau, hoặc qua `slug-check` | Thấp | Luôn trả `404` cho người ngoài. Rate-limit `slug-check` |
| R6 | Spam tạo workspace làm phình DB | Thấp | 5/giờ/người (5.8) |
| R7 | Mất bất biến owner (owner_id khác member owner) khi làm chuyển giao quyền sở hữu sau này | Trung bình | Ghi bất biến vào code (comment + test). Chuyển giao chạy trong transaction |
| R8 | Luật slug ở web và API lệch nhau (sửa một nơi quên nơi kia) | Trung bình | Một nguồn duy nhất trong `packages/` (Q8) |
| R9 | Đổi `/` từ HomePage sang route điều hướng làm hỏng test hoặc luồng đăng nhập đang chạy | Thấp | Cập nhật test `sessionDestination`, chạy lại e2e auth |

---

## 12. Câu hỏi cần chốt

| # | Câu hỏi | Đề xuất mặc định |
| --- | --- | --- |
| Q1 | Switcher hiện vai trò của người tạo là "Owner" (theo dữ liệu) hay "Admin" (như draft)? | **"Owner"**. Nhãn phải phản ánh đúng quyền thật |
| Q2 | Slug bảo lưu trả `400` (cùng nhóm lỗi kiểm tra) hay `422 SLUG_RESERVED` riêng như requirement? | **`400 VALIDATION_ERROR`** với `fields.slug`. Không thêm `422` khi dự án chưa dùng |
| Q3 | Độ dài tối thiểu của slug: 1 (requirement) hay 3? | **3**. Slug 1–2 ký tự dễ đụng route tương lai và khó nhận diện. Tên vẫn cho phép từ 1 ký tự |
| Q4 | Các nút chưa có tính năng (Settings, Invite members, Workspace invites) ẩn hẳn hay hiện ở trạng thái disabled? | **Ẩn hẳn**. Nút không bấm được chỉ gây khó hiểu. Hiện lại khi tính năng có |
| Q5 | Màu nền logo chữ cái: cố định `#0D1117`, ngẫu nhiên, hay chọn theo id? | **Chọn theo hash của `id`** trong một bảng 8 màu, đủ tương phản với chữ trắng, có Cyber Black `#0F172A`. Lưu vào `background_color` để sau này đổi được trong Settings |
| Q6 | Có cần cờ cấp hệ thống "chỉ instance admin được tạo workspace" không? | Không ở đợt này. Ghi backlog |
| Q7 | Có chặn slug theo tiền tố/chứa từ khoá (`admin-*`, `*-openplany`) để chống giả mạo không? | Chỉ chặn khớp chính xác. Xem lại khi có workspace công khai |
| Q8 | Đặt luật dùng chung (regex, danh sách bảo lưu, quy mô, `slugify`) ở đâu? | Tạo **`@repo/contracts`** (CLAUDE.md đã lên kế hoạch). Dùng TypeScript thuần, **chưa thêm Zod** (Zod là dependency mới, cần hỏi). API DTO import hằng số từ đây |
| Q9 | Có đo thời gian hoàn thành form (tiêu chí ≤ 30 s) không? Đo bằng gì? | Client gửi `durationMs` trong body `POST` dưới dạng trường tuỳ chọn, hoặc tạm đo bằng test usability. Chưa thêm công cụ analytics |
| Q10 | Có tạo project mẫu khi tạo workspace không? | Không. Module Projects chưa có |
| Q11 | Rate-limit `slug-check` làm thế nào khi chưa có thư viện throttling? | Bộ đếm trong bộ nhớ theo user (đủ cho một instance API). Chuyển sang Redis hoặc `@nestjs/throttler` khi scale (cần hỏi trước khi thêm) |
| Q12 | `GET /api/workspaces/:slug` có được kiêm luôn việc ghi `last_workspace_id` không? | Có (7.4). Nếu team muốn `GET` thuần đọc thì tách endpoint `PUT` riêng |

---

## 13. Chỉ số theo dõi

| Chỉ số | Ý nghĩa | Nguồn |
| --- | --- | --- |
| Tỷ lệ user đăng nhập lần đầu mà **không** tạo workspace trong 24 giờ | Bao nhiêu người chưa tạo workspace ngay. Nếu cao mà ít người được mời: nút Create workspace + chưa đủ nổi bật | `users.last_login` so với `workspaces.created_by_id` |
| Tỷ lệ `slug-check` trả `TAKEN`/`RESERVED` trên tổng số lần gọi | Slug tự sinh có hay bị đụng không. Cao thì cần gợi ý slug thay thế (`acme-2`) | Log API |
| Số `409` trên `POST` | Tần suất race condition. Kỳ vọng ≈ 0 | Log API |
| Tỷ lệ `400` theo từng trường | Luật nào khó hiểu với người dùng | Log API (chỉ tên trường) |
| Phân bố `organization_size` | Hiểu chân dung khách hàng (cá nhân hay doanh nghiệp), phục vụ định hướng sản phẩm | `SELECT organization_size, count(*) …` |
| Số workspace trung bình mỗi user | Có nhiều người cần nhiều workspace không, Switcher có đáng đầu tư thêm không | DB |
