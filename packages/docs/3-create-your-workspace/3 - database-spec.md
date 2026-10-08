# Database spec: Tạo Workspace

- **Dựa trên:**
  - [`2 - business-analytics-spec.md`](./2%20-%20business-analytics-spec.md) (gọi tắt **BA**): luật mục 5, mô hình mục 6, câu hỏi Q1–Q12, rủi ro R1–R9. Các mã A*, Q*, R* trong file này trỏ về BA.
  - [`1 - requirement.md`](./1%20-%20requirement.md) mục 4.
- **File SQL đi kèm:** [`sample-workspace.sql`](./sample-workspace.sql) chứa đúng DDL ở mục 3, chạy được ngay trong `psql`. Sửa mục 3 thì sửa cả file này.
  - Migration đã chạy: `1791379542810-CreateAuthTables.ts`.
- **CSDL đích:** PostgreSQL 17 (container `postgres:17`). Câu D1 của login đã chốt là PostgreSQL thường.
- **Trạng thái:** bản nháp, viết theo **đề xuất mặc định** của Q1–Q12. Đáp án khác thì xem mục 9.
- **Đã kiểm chứng:** DDL mục 3 và các truy vấn 4.1–4.5 đã chạy thử trên `openplany_test` (PostgreSQL 17.11) trong một transaction rồi `ROLLBACK`, nên không để lại gì. Kết quả: các `CHECK`/`UNIQUE` chặn đúng ca sai, `EXPLAIN` dùng đúng index ở mục 6, và câu `TRUNCATE` cũ lỗi đúng như mục 7 dự đoán.

---

## 1. Tóm tắt

| Thay đổi | Chi tiết |
| --- | --- |
| Migration mới | `CreateWorkspaceTables`: bảng `workspaces`, bảng `workspace_members`, cột `users.last_workspace_id` (mục 3) |
| Entity mới | `Workspace`, `WorkspaceMember` trong `apps/api/src/workspaces/entities/` |
| Entity sửa | `User` thêm `lastWorkspaceId` |
| Repository mới | `WorkspacesRepository` (abstract + bản TypeORM), có transaction (mục 5) |
| Test e2e | Câu `TRUNCATE` trong [createE2eApp.ts](../../../apps/api/test/createE2eApp.ts) **phải** thêm hai bảng mới (mục 7) |
| Dữ liệu cũ | Không cần chuyển dữ liệu. Sau khi triển khai, **mọi user hiện có đều chưa có workspace**, nên lần đăng nhập tới họ sẽ thấy trang chủ trống có nút **Create workspace +** trên head bar (BA 3.1, 4.3). Đây là hành vi mong muốn |

---

## 2. Các quyết định thiết kế chính

| Vấn đề | Phương án dễ gặp và chỗ yếu | OpenPlany chọn |
| --- | --- | --- |
| Dùng lại slug | Unique chỉ trên workspace chưa xoá, nên slug cũ được giải phóng và có thể bị người khác lấy (R2) | `UNIQUE (slug)` trên toàn bảng, kể cả workspace đã xoá (A2) |
| Index phụ cho slug | Thêm index `varchar_pattern_ops` để tìm theo tiền tố | **Không.** Không có tìm slug theo tiền tố |
| Kiểm tra FK | Khai báo `DEFERRABLE INITIALLY DEFERRED` cho mọi FK | **Không.** Transaction chèn theo đúng thứ tự, không cần hoãn kiểm tra FK |
| Kiểu của `role` | Mã số với `CHECK (role >= 0)`, vẫn nhận các giá trị vô nghĩa và khó đọc khi debug | `varchar(20)` + `CHECK` liệt kê đủ 4 giá trị |
| Vai trò người tạo | Gán `admin`, còn owner chỉ ghi ở `workspaces.owner_id`: hai nguồn sự thật | Người tạo nhận `role = 'owner'` (BA 5.7, Q1), có partial unique index (3.2) |
| Thành viên rời rồi quay lại | Xoá mềm bằng `deleted_at` kèm `UNIQUE (workspace_id, member_id, deleted_at)`. Ràng buộc này **không** chặn được hai dòng đang hoạt động trùng nhau, vì hai `NULL` được coi là khác nhau | Chỉ dùng `is_active`. Một cặp (workspace, user) **chỉ có một dòng**: rời đi thì tắt `is_active`, quay lại thì bật lại (DB1) |
| Workspace gần nhất | Lưu id ở một bảng phụ mà không có FK, nên có thể trỏ tới workspace không còn tồn tại | Cột `users.last_workspace_id` có FK `ON DELETE SET NULL` (3.3) |
| Cài đặt theo từng thành viên | Tạo sẵn nhiều dòng cài đặt (bộ lọc, trang chủ, ghim…) cho mỗi thành viên ngay trong transaction tạo | **Chưa làm** (DB4). Khi cần thì tạo lúc đọc lần đầu (upsert), để transaction tạo luôn nhỏ |
| Màu nền logo | Màu ngẫu nhiên, không chuẩn hoá chữ hoa chữ thường | Chọn theo hash của id từ bảng màu cố định (Q5), luôn viết hoa, có `CHECK` định dạng |
| Múi giờ workspace | Luôn `UTC` | Lấy từ `users.user_timezone` của người tạo |
| Bảng thuộc workspace sau này | Chỉ nối tới workspace gián tiếp qua project | Đặt quy ước `workspace_id` cho mọi bảng thuộc workspace ngay từ bây giờ (mục 8) |

---

## 3. Migration `CreateWorkspaceTables`

Tên file theo quy ước TypeORM: `<timestamp>-CreateWorkspaceTables.ts`, tạo bằng `pnpm --filter @repo/api migration:create src/database/migrations/CreateWorkspaceTables`. Viết SQL tay giống `CreateAuthTables`, không dùng `migration:generate`, vì cần các ràng buộc `CHECK` và partial index mà generate không sinh ra. Cách đặt tên ràng buộc giống migration cũ: `<bảng>_<cột>_key`, `<bảng>_<cột>_check`, `idx_<bảng>_<cột>`.

### 3.1 `workspaces`

```sql
CREATE TABLE workspaces (
    id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    name              varchar(80)   NOT NULL,
    slug              varchar(48)   NOT NULL,
    logo              text,
    owner_id          uuid          NOT NULL REFERENCES users (id),
    created_by_id     uuid          REFERENCES users (id),
    updated_by_id     uuid          REFERENCES users (id),
    organization_size varchar(20)   NOT NULL,
    timezone          varchar(255)  NOT NULL DEFAULT 'UTC',
    background_color  varchar(7)    NOT NULL,
    created_at        timestamptz   NOT NULL DEFAULT now(),
    updated_at        timestamptz   NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    CONSTRAINT workspaces_slug_key UNIQUE (slug),
    CONSTRAINT workspaces_name_check CHECK (btrim(name) <> ''),
    CONSTRAINT workspaces_slug_check CHECK (
        char_length(slug) BETWEEN 3 AND 48
        AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
    CONSTRAINT workspaces_organization_size_check CHECK (
        organization_size IN ('Just myself', '2-10', '11-50', '51-200', '201-500', '500+')
    ),
    CONSTRAINT workspaces_background_color_check CHECK (background_color ~ '^#[0-9A-F]{6}$')
);

CREATE INDEX idx_workspaces_owner_id ON workspaces (owner_id);
CREATE INDEX idx_workspaces_created_by_created_at ON workspaces (created_by_id, created_at);
```

| Cột | Ghi bởi | Ghi chú |
| --- | --- | --- |
| `name` | Tạo (sau này: Settings) | Ứng dụng đã chuẩn hoá NFC và trim. `CHECK` chặn tên chỉ toàn khoảng trắng nếu dữ liệu được ghi không qua API. Độ dài 80 do `varchar(80)` đảm bảo |
| `slug` | Chỉ lúc tạo | **Không bao giờ `UPDATE`** (BA 5.5). Danh sách bảo lưu **không** nằm ở DB: danh sách này thay đổi theo route của web, đặt ở DB thì mỗi lần đổi phải viết migration |
| `logo` | Chưa dùng | URL dạng text. Chưa có `logo_asset_id` (A3) |
| `owner_id` | Lúc tạo | FK mặc định `NO ACTION`: **không xoá cứng được** user đang sở hữu workspace. Đây là điều mong muốn |
| `created_by_id`, `updated_by_id` | Lúc tạo (và sau này khi sửa) | Cho phép `NULL`, để sau này có thể tạo workspace từ script hệ thống. Luật tần suất (mục 4.2) đếm theo `created_by_id` |
| `organization_size` | Lúc tạo | `NOT NULL` + `CHECK`. Chuỗi khớp đúng nhãn trên UI (`'2-10'`), không cần bảng ánh xạ |
| `timezone` | Lúc tạo | Sao chép từ `users.user_timezone` (mục 4.3). Không có `CHECK` vì danh sách múi giờ IANA thay đổi theo phiên bản |
| `background_color` | Lúc tạo | `#RRGGBB` viết hoa. Ứng dụng chọn màu (Q5) |
| `created_at`, `updated_at` | Lúc tạo | Ứng dụng truyền thời điểm từ `Clock`, giống `signIn`, để test cố định được thời gian. `DEFAULT now()` chỉ là dự phòng |
| `deleted_at` | Chưa dùng | Xoá mềm thuộc tính năng sau. Mọi truy vấn đọc đều lọc `deleted_at IS NULL`, **trừ** truy vấn kiểm tra slug (4.1) |

**Index:**

- `workspaces_slug_key`: tìm workspace theo slug (4.1, 4.5) và chặn trùng slug.
- `idx_workspaces_owner_id`: PostgreSQL **không tự tạo** index cho cột FK. Không có index này thì muốn biết "user X sở hữu workspace nào", hoặc kiểm tra FK trước khi xoá user, đều phải quét cả bảng.
- `idx_workspaces_created_by_created_at`: phục vụ truy vấn đếm theo tần suất. Cột so sánh bằng (`created_by_id`) đứng trước, cột so sánh khoảng (`created_at`) đứng sau, đúng luật tiền tố trái của B-tree.
- `updated_by_id` **không** cần index: không truy vấn nào lọc theo nó, và user không bị xoá cứng.

### 3.2 `workspace_members`

```sql
CREATE TABLE workspace_members (
    id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid         NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    member_id    uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role         varchar(20)  NOT NULL DEFAULT 'member',
    is_active    boolean      NOT NULL DEFAULT true,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT workspace_members_workspace_member_key UNIQUE (workspace_id, member_id),
    CONSTRAINT workspace_members_role_check CHECK (role IN ('owner', 'admin', 'member', 'guest'))
);

CREATE INDEX idx_workspace_members_member_id_active
    ON workspace_members (member_id) WHERE is_active = true;

CREATE UNIQUE INDEX workspace_members_one_owner_key
    ON workspace_members (workspace_id) WHERE role = 'owner';
```

- **`role` mặc định `'member'`** (A1). Service luôn truyền `role` tường minh.
- **`workspace_members_workspace_member_key`** vừa chặn trùng, vừa là index cho truy vấn "danh sách thành viên của workspace" và đếm thành viên, vì `workspace_id` là cột đứng đầu.
- **`idx_workspace_members_member_id_active`** phục vụ truy vấn "workspace của tôi" (4.4). Đây là partial index, nên câu truy vấn phải có **đúng** điều kiện `is_active = true` thì planner mới dùng được index.
- **`workspace_members_one_owner_key`** để DB đảm bảo một workspace **có tối đa một owner** (bất biến ở BA 5.7, rủi ro R7). Ràng buộc "**có ít nhất** một owner" và "owner trùng `workspaces.owner_id`" thì DB không tự kiểm tra được nếu không dùng trigger. Phần đó kiểm tra bằng test (mục 7). Index này được kiểm tra **ngay sau mỗi câu lệnh**. Vì vậy, khi làm tính năng chuyển giao quyền sở hữu, phải hạ owner cũ xuống trước rồi mới nâng owner mới lên, trong cùng một transaction.
- **`ON DELETE CASCADE`** trên `workspace_id`: workspace chỉ bị xoá mềm nên cascade gần như không bao giờ chạy. Có nó thì xoá cứng (ví dụ dọn dữ liệu test) không bỏ lại dòng thành viên nào.

### 3.3 `users.last_workspace_id`

```sql
ALTER TABLE users
    ADD COLUMN last_workspace_id uuid REFERENCES workspaces (id) ON DELETE SET NULL;
```

- Thêm cột cho phép `NULL`, không có `DEFAULT`: PostgreSQL chỉ sửa metadata, không ghi lại bảng. Kiểm tra FK cũng nhanh vì mọi giá trị đang là `NULL`. Bảng `users` nhỏ nên không cần tách thành bước `NOT VALID` rồi `VALIDATE`.
- **Không** tạo index trên cột này. Index chỉ có ích khi xoá cứng workspace (để `SET NULL` tìm các user trỏ tới nó), mà workspace chỉ bị xoá mềm.
- Cột này **không** làm thay đổi `users.updated_at`. Đây là sở thích điều hướng, không phải sửa profile.
- Workspace bị xoá mềm thì cột vẫn trỏ tới nó. Truy vấn 4.4 lọc `deleted_at IS NULL`, nên giá trị này tự bị bỏ qua.

### 3.4 `up()` và `down()`

Thứ tự trong `up()`: tạo `workspaces` → tạo `workspace_members` → `ALTER TABLE users`. Mọi bước chạy trong một transaction, là mặc định của TypeORM. Không có `CREATE INDEX CONCURRENTLY` vì các bảng mới và còn rỗng.

```sql
-- down(): làm ngược lại
ALTER TABLE users DROP COLUMN IF EXISTS last_workspace_id;
DROP TABLE IF EXISTS workspace_members;
DROP TABLE IF EXISTS workspaces;
```

`down()` **xoá dữ liệu workspace**. Chỉ dùng ở môi trường dev.

---

## 4. Truy vấn

Mọi truy vấn đi qua `WorkspacesRepository` (query builder hoặc `query()` có tham số, không ghép chuỗi). `$now` lấy từ `Clock`.

### 4.1 Kiểm tra slug (`GET /slug-check`, và dùng gián tiếp khi tạo)

```sql
SELECT EXISTS (SELECT 1 FROM workspaces WHERE slug = $1) AS taken;
```

**Không** lọc `deleted_at`: slug của workspace đã xoá vẫn tính là đã dùng (A2). Truy vấn chỉ đọc unique index.

### 4.2 Đếm số workspace đã tạo gần đây (luật tần suất, BA 5.8)

```sql
SELECT count(*)::int AS created, min(created_at) AS oldest
FROM workspaces
WHERE created_by_id = $1 AND created_at > $now - interval '1 hour';
```

- Workspace đã xoá mềm **vẫn được đếm**: xoá đi rồi tạo lại không giúp vượt giới hạn.
- Nếu `created >= 5` thì `retryAfterSeconds = ceil((oldest + 1 giờ − now) / 1 giây)`.
- Truy vấn này chạy **trong** transaction tạo, sau khi lấy advisory lock (4.3). Nếu không, hai request song song của cùng một người có thể cùng đếm ra 4 và cùng được tạo.

### 4.3 Tạo workspace (một transaction)

```sql
BEGIN;  -- READ COMMITTED (mặc định)

-- 1. Xếp hàng các request tạo của CÙNG một user; user khác không bị chặn.
--    Khoá tự nhả khi COMMIT/ROLLBACK, an toàn với connection pool.
SELECT pg_advisory_xact_lock(hashtextextended('workspace-create:' || $userId, 0));

-- 2. Luật tần suất (4.2). Vượt giới hạn: ROLLBACK, trả 429.

-- 3. Tạo workspace; đọc múi giờ của người tạo trong cùng câu lệnh.
INSERT INTO workspaces (id, name, slug, owner_id, created_by_id, updated_by_id,
                        organization_size, timezone, background_color, created_at, updated_at)
SELECT $id, $name, $slug, u.id, u.id, u.id, $orgSize, u.user_timezone, $color, $now, $now
FROM users u
WHERE u.id = $userId AND u.is_active AND u.masked_at IS NULL
RETURNING id, name, slug, logo, background_color, organization_size, timezone, created_at;
--    0 dòng trả về  → tài khoản vừa bị khoá: ROLLBACK, trả 401.
--    lỗi 23505 trên constraint workspaces_slug_key → ROLLBACK, trả 409 (R1).

-- 4. Người tạo là owner.
INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at)
VALUES ($workspaceId, $userId, 'owner', $now, $now);

-- 5. Ghi nhớ workspace gần nhất.
UPDATE users SET last_workspace_id = $workspaceId WHERE id = $userId;

COMMIT;
```

- **Không** chạy `SELECT` kiểm tra trùng slug trước bước 3. Ràng buộc `UNIQUE` là trọng tài duy nhất không bị race condition. Advisory lock ở bước 1 chỉ xếp hàng theo **user**, nên không ngăn được hai user khác nhau cùng lấy một slug. Trường hợp đó do `UNIQUE` xử lý.
- Repository nhận diện lỗi trùng slug bằng `QueryFailedError` có `driverError.code === '23505'` **và** `driverError.constraint === 'workspaces_slug_key'`. Sau đó repository ném lỗi miền `SlugAlreadyExistsError`. Lỗi `23505` của ràng buộc khác (không xảy ra trong luồng này) thì ném tiếp nguyên trạng, để thành `500` và được log.
- `$id` do service sinh bằng `randomUUID()` **trước** khi ghi, vì màu nền được chọn theo hash của id (Q5) và phải có ngay trong câu `INSERT`. `DEFAULT gen_random_uuid()` vẫn giữ cho dữ liệu chèn tay.
- Bước 3 dùng `INSERT … SELECT FROM users`, nên không cần thêm một lần đọc user. Cùng lúc đó, câu này kiểm tra tài khoản vẫn còn active ngay tại thời điểm ghi, giống cách `updateProfile` đang làm.
- Không có HTTP call nào trong transaction. Transaction ngắn: 1 lock, 1 count, 2 insert, 1 update, tất cả đều đi qua index.

### 4.4 Danh sách workspace của tôi (`GET /api/workspaces`)

```sql
SELECT w.id, w.name, w.slug, w.logo, w.background_color, w.organization_size, w.timezone,
       w.created_at, m.role,
       (SELECT count(*)::int FROM workspace_members c
         WHERE c.workspace_id = w.id AND c.is_active = true) AS member_count,
       (u.last_workspace_id = w.id) AS is_last
FROM workspace_members m
JOIN workspaces w ON w.id = m.workspace_id AND w.deleted_at IS NULL
JOIN users u      ON u.id = m.member_id
WHERE m.member_id = $userId AND m.is_active = true
ORDER BY lower(w.name), w.created_at;
```

- Một câu truy vấn trả về đủ danh sách, số thành viên và workspace gần nhất. Không có N+1: subquery đếm dùng index `workspace_members_workspace_member_key`.
- `lastWorkspaceSlug` trong response là `slug` của dòng có `is_last = true`, hoặc `null`. Workspace gần nhất đã bị xoá hoặc user đã rời đi thì không có dòng nào, tự nhiên thành `null`.
- Sắp xếp theo `lower(name)` cho kết quả ổn định. Thứ tự này không đúng hoàn toàn với chữ tiếng Việt có dấu, nhưng đủ cho MVP (DB7).

### 4.5 Một workspace theo slug, có kiểm tra thành viên (`GET /api/workspaces/:slug`)

```sql
SELECT w.id, w.name, w.slug, w.logo, w.background_color, w.organization_size, w.timezone,
       w.created_at, m.role,
       (SELECT count(*)::int FROM workspace_members c
         WHERE c.workspace_id = w.id AND c.is_active = true) AS member_count
FROM workspaces w
JOIN workspace_members m
  ON m.workspace_id = w.id AND m.member_id = $userId AND m.is_active = true
WHERE w.slug = $slug AND w.deleted_at IS NULL;
```

- Không có dòng nào thì trả `404`. Không phân biệt "workspace không tồn tại" với "không phải thành viên" (BA 5.9).
- Có dòng thì ghi nhớ workspace gần nhất, **chỉ ghi khi giá trị khác** để không ghi vô ích mỗi lần tải trang:

```sql
UPDATE users SET last_workspace_id = $workspaceId
WHERE id = $userId AND last_workspace_id IS DISTINCT FROM $workspaceId;
```

`IS DISTINCT FROM` xử lý được trường hợp cột đang là `NULL`, còn `<>` thì không. Hai câu này không cần transaction: nếu câu `UPDATE` lỗi thì chỉ mất thông tin "workspace gần nhất". Service log lỗi đó rồi vẫn trả `200`.

---

## 5. Entity và repository

### 5.1 Entity

```ts
// workspaces/entities/workspace.entity.ts
@Entity({ name: 'workspaces' })
export class Workspace {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 80 }) name: string;
  @Column({ type: 'varchar', length: 48 }) slug: string;
  @Column({ type: 'text', nullable: true }) logo: string | null;
  @Column({ name: 'owner_id', type: 'uuid' }) ownerId: string;
  @Column({ name: 'created_by_id', type: 'uuid', nullable: true }) createdById: string | null;
  @Column({ name: 'updated_by_id', type: 'uuid', nullable: true }) updatedById: string | null;
  @Column({ name: 'organization_size', type: 'varchar', length: 20 }) organizationSize: OrganizationSize;
  @Column({ type: 'varchar', length: 255 }) timezone: string;
  @Column({ name: 'background_color', type: 'varchar', length: 7 }) backgroundColor: string;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt: Date | null;
}

// workspaces/entities/workspaceMember.entity.ts: workspaceId, memberId, role: WorkspaceRole, isActive, createdAt, updatedAt
// auth/entities/user.entity.ts: thêm
@Column({ name: 'last_workspace_id', type: 'uuid', nullable: true }) lastWorkspaceId: string | null;
```

- Dùng cột id thuần (`ownerId: string`), **không** khai báo quan hệ `@ManyToOne`, giống entity `Session` hiện có. Như vậy không có lazy load ngầm, và mọi JOIN đều được viết tường minh ở 4.4 và 4.5.
- `OrganizationSize` và `WorkspaceRole` là union type lấy từ `@repo/contracts` (Q8). Không dùng `enum` TypeScript.
- Đăng ký bằng `TypeOrmModule.forFeature([Workspace, WorkspaceMember])` trong `WorkspacesModule`. `autoLoadEntities` đã bật.

### 5.2 Interface repository

```ts
/** A workspace as seen by one member: the row plus that member's role and the head count. */
export interface MemberWorkspace {
  id: string; name: string; slug: string; logo: string | null; backgroundColor: string;
  organizationSize: OrganizationSize; timezone: string; createdAt: Date;
  role: WorkspaceRole; memberCount: number;
}

export interface NewWorkspace {
  id: string; name: string; slug: string; organizationSize: OrganizationSize; backgroundColor: string;
}

export type CreateWorkspaceResult =
  | { status: 'created'; workspace: MemberWorkspace }
  | { status: 'rate_limited'; retryAfterSeconds: number }
  | { status: 'user_inactive' };

export class SlugAlreadyExistsError extends Error {}

export abstract class WorkspacesRepository {
  /** Includes soft-deleted workspaces (4.1). */
  abstract slugExists(slug: string): Promise<boolean>;
  /** The whole 4.3 transaction. Throws SlugAlreadyExistsError on a slug race. */
  abstract create(userId: string, input: NewWorkspace, now: Date): Promise<CreateWorkspaceResult>;
  /** 4.4, ordered for display. */
  abstract listForMember(userId: string): Promise<{ workspaces: MemberWorkspace[]; lastWorkspaceId: string | null }>;
  /** 4.5. null = not found or not an active member. */
  abstract findForMember(slug: string, userId: string): Promise<MemberWorkspace | null>;
  abstract rememberLastWorkspace(userId: string, workspaceId: string): Promise<void>;
}
```

- Luật tần suất (giới hạn 5, khung 1 giờ) truyền vào repository dưới dạng **hằng số đặt ở service** (`WORKSPACE_CREATE_LIMIT`, `WORKSPACE_CREATE_WINDOW_MS`). Repository chỉ chạy truy vấn và trả kết quả để service quyết định. Đề xuất truyền thêm tham số `limit` vào `create()`.
- Transaction dùng `this.dataSource.transaction(async (manager) => …)`. Mọi câu trong 4.3 đều chạy qua `manager`, không chạy qua repository toàn cục. Nếu chạy nhầm thì câu đó nằm ngoài transaction.

---

## 6. Hiệu năng và quy mô

| Truy vấn | Đường đi dự kiến (`EXPLAIN`) | Ghi chú |
| --- | --- | --- |
| 4.1 kiểm tra slug | Index Only Scan `workspaces_slug_key` | Gọi nhiều nhất (mỗi lần ngừng gõ 300 ms) |
| 4.2 đếm | Index Scan `idx_workspaces_created_by_created_at` | Tối đa vài dòng |
| 4.4 danh sách | Index Scan `idx_workspace_members_member_id_active` → Nested Loop theo `workspaces_pkey` | Mỗi user thường có 1–5 workspace |
| 4.5 theo slug | Index Scan `workspaces_slug_key` + `workspace_members_workspace_member_key` | |

Bảng nhỏ (hàng nghìn dòng trong năm đầu), mọi truy vấn đều đi qua index, không cần cache. Khi viết e2e thì chạy `EXPLAIN` một lần để xác nhận index được dùng (mục 7).

---

## 7. Test và dữ liệu dev

| Việc | Chi tiết |
| --- | --- |
| **Sửa `TRUNCATE`** trong `createE2eApp.ts` | Đổi thành `TRUNCATE workspace_members, workspaces, login_attempts, sessions, users`. Nếu không, PostgreSQL từ chối truncate `users` vì bảng mới có FK trỏ tới nó, và **mọi e2e hiện có sẽ lỗi** |
| Test migration | Trên DB `_test`: `migration:run` → `migration:revert` → `migration:run`, không lỗi. Đây là cách duy nhất chắc chắn `down()` đúng |
| Ràng buộc DB (e2e, gọi SQL trực tiếp) | Chèn slug `Acme`, `-acme`, `ab` → lỗi `23514` (check). Chèn owner thứ hai cho cùng workspace → lỗi `23505` trên `workspace_members_one_owner_key` |
| Bất biến owner (e2e sau khi tạo qua API) | `SELECT count(*) FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id WHERE m.role = 'owner' AND m.member_id = w.owner_id` = số workspace |
| Race condition (e2e) | Gửi hai `POST` cùng slug bằng `Promise.all`: một `201`, một `409`, `workspace_members` có đúng 1 dòng |
| Seed dev | Không bắt buộc: script `workspace:create <ownerEmail> <name> <slug>`, đặt cạnh `user:create` và gọi lại `WorkspacesRepository.create` (không ghi SQL riêng) |

---

## 8. Quy ước cho các bảng sau này

Một công cụ quản lý dự án trưởng thành thường có hàng chục bảng thuộc workspace. Đặt luật ngay từ bây giờ để không phải sửa lại sau:

1. Mọi bảng thuộc một workspace (project, issue, label…) có cột `workspace_id uuid NOT NULL REFERENCES workspaces (id)`, **kể cả** khi đã suy ra được qua project. Như vậy truy vấn nào cũng lọc được theo workspace mà không cần JOIN.
2. Index của các bảng đó **bắt đầu bằng `workspace_id`**, ví dụ `(workspace_id, project_id, …)`.
3. Workspace chỉ bị **xoá mềm**. Xoá cứng sẽ kéo theo cascade qua hàng chục bảng, dễ khoá lâu và mất dữ liệu không khôi phục được.
4. **Row-Level Security** (DB5) có thể thêm sau như một lớp phòng thủ nữa, nhưng không phải bây giờ. Ứng dụng dùng một role DB duy nhất, và role đó đang là owner của bảng nên **mặc định bỏ qua RLS** nếu không bật `FORCE ROW LEVEL SECURITY`. Ngoài ra, mỗi transaction phải đặt `SET LOCAL app.workspace_id` (không dùng `SET` thường nếu đi qua PgBouncer ở transaction mode). Hiện tại, việc chặn truy cập chéo workspace do `WorkspaceMemberGuard` cùng điều kiện `workspace_id` trong mọi truy vấn đảm nhận.

Phác thảo bảng lời mời (tính năng sau, **không** nằm trong migration này):

```sql
CREATE TABLE workspace_member_invites (
    id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid         NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    email        varchar(255) NOT NULL,          -- lưu dạng lower-case
    role         varchar(20)  NOT NULL CHECK (role IN ('admin', 'member', 'guest')),  -- không mời làm owner
    token_hash   bytea        NOT NULL UNIQUE,   -- như sessions: chỉ lưu hash
    invited_by_id uuid        REFERENCES users (id),
    expires_at   timestamptz  NOT NULL,
    responded_at timestamptz,
    created_at   timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX workspace_member_invites_pending_key
    ON workspace_member_invites (workspace_id, email) WHERE responded_at IS NULL;
```

Lưu `token_hash` thay vì token thô (giống `sessions`), và có `expires_at` để lời mời tự hết hạn.

---

## 9. Câu hỏi cần chốt (bổ sung cho Q1–Q12)

| # | Câu hỏi | Đề xuất |
| --- | --- | --- |
| DB1 | Thành viên rời workspace: tắt `is_active` trên **cùng một dòng** hay xoá mềm (`deleted_at`) và tạo dòng mới khi quay lại? | Chỉ dùng `is_active`, mỗi cặp một dòng. Không vướng lỗi `UNIQUE` với `NULL` (mục 2). Lịch sử ra/vào, nếu cần, ghi vào bảng audit riêng |
| DB2 | Có dùng partial unique index để đảm bảo "tối đa một owner" không? | Có (3.2) |
| DB3 | Có dùng advisory lock để luật tần suất chính xác khi request chạy song song không? | Có (4.3). Lock theo từng user, chỉ giữ trong thời gian transaction ngắn |
| DB4 | Có tạo sẵn các dòng cài đặt theo từng thành viên (bộ lọc, trang chủ, ghim…) ngay khi tạo workspace không? | Chưa. Khi cần thì tạo lúc đọc lần đầu, không làm phình transaction tạo |
| DB5 | Có bật Row-Level Security không? | Chưa (mục 8.4). Xem lại khi có nhiều bảng thuộc workspace |
| DB6 | Đặt `CHECK` cho tên, slug, quy mô, màu ở tầng DB? | Có. Bảng mới chưa có dữ liệu cũ nên không vướng như profile (profile database-spec 2.2). Danh sách slug bảo lưu thì **không** đưa vào DB |
| DB7 | Sắp xếp tên có dấu tiếng Việt cho đúng (dùng collation ICU)? | Chưa. `lower(name)` là đủ cho MVP. Web có thể sắp lại bằng `Intl.Collator('vi')` nếu cần |
| DB8 | Nếu Q3 chốt độ dài slug tối thiểu là 1 thay vì 3? | Sửa `char_length(slug) BETWEEN 1 AND 48` trong `workspaces_slug_check`. Chỉ cần sửa trước khi chạy migration trên môi trường dùng chung |
