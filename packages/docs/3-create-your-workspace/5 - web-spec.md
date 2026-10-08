# Web spec: Tạo Workspace

- **Dựa trên:**
  - Draft: [`create-your-workspace-1.png`](./create-your-workspace-1.png), [`-2.png`](./create-your-workspace-2.png) (form, dropdown), [`-3.png`](./create-your-workspace-3.png) (Switcher). Các ảnh chụp ở tỉ lệ khoảng 2×; số đo bên dưới đã quy về 1× và làm tròn theo thang đo của Mantine.
  - [`2 - business-analytics-spec.md`](./2%20-%20business-analytics-spec.md) (**BA**): luồng mục 3, đọc draft mục 4, luật mục 5, AC mục 9, Q1–Q12.
  - [`4 - api-spec.md`](./4%20-%20api-spec.md) (**API**): endpoint, mã lỗi, `@repo/contracts`, API1–API7.
  - Code hiện có: `routes.tsx`, `RequireAuth`, `AuthProvider` (`expireSession`, `signOut`), `lib/apiClient.ts` (`request`, `ApiRequestError`), `AppLayout`/`AppHeader`, `UserButton`, `ColorSchemeToggle` (`@repo/ui`), `useProfileForm` (mẫu `@mantine/form`), `test/fetchMock.ts`.
- **Trạng thái:** bản nháp, viết theo đề xuất mặc định của Q1–Q12 và API1–API7. Chưa dựng.
- **Stack:** React 19, react-router 8, Mantine 9 (`@mantine/form`, `@mantine/hooks`, `@mantine/notifications` đã có), CSS Modules, theme sáng/tối ở `@repo/ui`. **Không thêm dependency mới.** Icon vẽ bằng SVG inline (W4).

---

## 1. Thành phần và vị trí file

| File | Vai trò | Trạng thái |
| --- | --- | --- |
| `features/workspaces/api/workspaceApi.ts` | `list()`, `get(slug)`, `create(body)`, `checkSlug(slug, signal)`. Kiểu dữ liệu import từ `@repo/contracts` | Mới |
| `features/workspaces/WorkspaceProvider.tsx`, `workspaceContext.ts`, `useWorkspaces.ts` | Danh sách workspace của user: `state`, `refresh()`, `add(workspace)` (mục 3) | Mới |
| `features/workspaces/routes/HomeRedirect.tsx` | Route `/`: chuyển tới workspace gần nhất, hoặc render `NoWorkspaceHome` khi chưa có workspace (BA 3.1) | Mới (thay `HomePage` ở `/`) |
| `features/workspaces/routes/NoWorkspaceHome.tsx` + `.module.css` | Trang chủ trống cho người chưa có workspace: `AppHeader` + lời nhắn + nút tạo (mục 5.4) | Mới |
| `features/workspaces/CreateWorkspaceButton.tsx` | Nút **Create workspace +** trên head bar, chỉ hiện khi chưa có workspace (mục 5.4) | Mới |
| `features/workspaces/routes/WorkspaceLayout.tsx` | Route `/:workspaceSlug`: gọi `GET /api/workspaces/:slug`, cung cấp workspace hiện tại, render `AppHeader` + `<Outlet />` | Mới |
| `features/workspaces/routes/WorkspaceNotFound.tsx` | Trang `404` của workspace và route lạ | Mới |
| `features/workspaces/create/CreateWorkspaceRoute.tsx` | Route `/create-workspace`: khung trang, điều hướng sau khi tạo | Mới |
| `features/workspaces/create/CreateWorkspaceForm.tsx` + `.module.css` | Form 3 ô + 2 nút (mục 4) | Mới |
| `features/workspaces/create/useCreateWorkspaceForm.ts` | `useForm`, đồng bộ slug theo tên, gửi API, map lỗi | Mới |
| `features/workspaces/create/useSlugAvailability.ts` | Debounce 300 ms, huỷ request cũ, trả trạng thái (mục 4.4) | Mới |
| `features/workspaces/create/SlugInput.tsx` + `.module.css` | Ô URL có tiền tố host chỉ đọc | Mới |
| `features/workspaces/switcher/WorkspaceSwitcher.tsx` + `.module.css` | Menu ở góc trái header (mục 5) | Mới |
| `features/workspaces/WorkspaceAvatar.tsx` | Ô vuông màu + chữ cái đầu. Dùng trong Switcher | Mới |
| `features/layout/AppHeader.tsx` | Bên trái: `WorkspaceSwitcher` khi đang ở trong workspace, hoặc logo + `CreateWorkspaceButton` khi chưa có workspace. Nút "Sign out" chỉ còn ở trạng thái chưa có workspace (mục 5.4) | Sửa |
| `features/layout/AppLayout.tsx` | Xoá: thay bằng `WorkspaceLayout` | Xoá |
| `features/home/HomePage.tsx` | Thành trang chủ **của một workspace** (index của `/:workspaceSlug`), tiêu đề hiện tên workspace | Sửa |
| `routes.tsx` | Cây route mới (mục 2) | Sửa |
| `package.json` | `"@repo/contracts": "workspace:*"` | Sửa |

---

## 2. Route và điều hướng

```text
/sign-in, /set-password, /forgot-password        (giữ nguyên)
RequireAuth
└─ WorkspaceProvider                               ← nạp GET /api/workspaces một lần
   ├─ /                    HomeRedirect            → NoWorkspaceHome khi chưa có workspace
   ├─ /create-workspace    CreateWorkspaceRoute    (không có header)
   └─ /:workspaceSlug      WorkspaceLayout         ← GET /api/workspaces/:slug
      └─ index             HomePage
*                          WorkspaceNotFound
```

- **Thứ tự route không ảnh hưởng:** react-router xếp hạng route theo độ cụ thể, nên `/create-workspace` (tĩnh) luôn thắng `/:workspaceSlug` (động). Tuy vậy, slug vẫn phải chặn các từ bảo lưu (BA 5.4). Nếu không, một workspace có slug `create-workspace` sẽ không bao giờ mở được.
- **`sessionDestination` không đổi:** vẫn trả `/`. Việc chọn workspace nằm ở `HomeRedirect`, nên `SignInRoute` không cần biết đến workspace.
- **`HomeRedirect`** (BA 3.1):

| Trạng thái `WorkspaceProvider` | Hành động |
| --- | --- |
| `loading` | Nền trống (`AuthLayout showCard={false}`), giống lúc kiểm tra phiên |
| `error` | Thông báo "Couldn't load your workspaces." + nút "Try again" (`refresh()`) |
| 0 workspace | **Ở lại `/`**, render `NoWorkspaceHome` (mục 5.4). Không tự chuyển sang `/create-workspace` (BA 3.1) |
| Có `lastWorkspaceSlug` | `<Navigate to={"/" + lastWorkspaceSlug} replace />` |
| Còn lại | Tới slug của workspace **đầu tiên** trong danh sách (đã sắp theo tên, mục 3) |

- **`WorkspaceLayout`:**
  - Đọc `:workspaceSlug` rồi gọi `workspaceApi.get(slug)`. Trong lúc chờ, nếu slug có trong danh sách của `WorkspaceProvider` thì dùng ngay dữ liệu đó để render header, tránh màn hình trống. Kết quả `GET` thay vào khi về.
  - `404` thì render `WorkspaceNotFound`. `401` thì `expireSession()`.
  - Đổi slug trên URL (chuyển workspace) thì gọi lại `GET`, huỷ request cũ bằng `AbortController`.
- **`WorkspaceNotFound`:** tiêu đề "Workspace not found", câu "It doesn't exist or you don't have access.", nút "Go to my workspaces" (về `/`). **Không** nói rõ workspace có tồn tại hay không (BA 5.9).
- **Tiêu đề tab:** `Create workspace · OpenPlany`; trong workspace là `{tên workspace} · OpenPlany`.

---

## 3. `WorkspaceProvider`

```ts
type WorkspacesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; workspaces: WorkspaceResponse[]; lastWorkspaceSlug: string | null };

interface WorkspacesContextValue {
  state: WorkspacesState;
  refresh: () => Promise<void>;
  /** Sau khi tạo: chèn vào danh sách, giữ thứ tự theo tên, đặt làm "gần nhất". */
  add: (workspace: WorkspaceResponse) => void;
}
```

- Nằm **dưới** `RequireAuth`, nên chỉ gọi API khi đã đăng nhập. Gọi một lần lúc mount, theo đúng cách `AuthProvider` đang làm: cờ `cancelled` khi unmount, lỗi thì `console.error` kèm ngữ cảnh rồi chuyển sang `error`, không nuốt lỗi.
- `401` thì `expireSession()`.
- Danh sách nhận từ API và workspace mới thêm bằng `add` đều được sắp theo **cùng một** `Intl.Collator('vi', { sensitivity: 'base' })`, dùng `toSorted` để không làm thay đổi mảng cũ. Nhờ vậy thứ tự giống nhau dù vừa tải lại hay vừa tạo, và tên có dấu tiếng Việt được sắp đúng (DB7). `add` dùng **functional setState** nên callback ổn định giữa các lần render.
- Giá trị context bọc trong `useMemo([state])`, giống `AuthProvider`.
- Đây là **server state** đặt trong context, vì dự án chưa có TanStack Query (CLAUDE.md: thêm thì phải hỏi, W3). Context chỉ giữ đúng dữ liệu server trả về, không chép sang state khác.
- **Một lượt chờ nối tiếp khi tải lần đầu:** phải xong `GET /api/auth/session` mới gọi `GET /api/workspaces`. Cả hai đều nhanh (< 50 ms ở local), nên chấp nhận cho MVP. Cách bỏ lượt chờ này nằm ở W2.

---

## 4. Trang tạo workspace

### 4.1 Bố cục (≥ 768px)

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                                                               [◐ theme] │
│                                                                          │
│   Create your workspace                          ← Title order 1, 28/600 │
│                                                                          │
│   Name your workspace *                                                  │
│   ┌────────────────────────────────────────────┐                         │
│   │ Something familiar and recognizable is…    │  ← TextInput md (42px)  │
│   └────────────────────────────────────────────┘                         │
│                                                                          │
│   Set your workspace's URL *                                             │
│   ┌────────────────────────────────────────────┐                         │
│   │ localhost:5173/│acme-corp                   │  ← SlugInput (4.3)      │
│   └────────────────────────────────────────────┘                         │
│   ✓ Available            ← aria-live, xanh success / đỏ error            │
│   You can't change this URL later.          ← description, dimmed        │
│                                                                          │
│   How many people will use this workspace? *                             │
│   ┌────────────────────────────────────────────┐                         │
│   │ Select a range                           ⌄ │  ← Select md            │
│   └────────────────────────────────────────────┘                         │
│                                                                          │
│   [ Create workspace ]  [ Go back ]       ← Button md: filled / default  │
└──────────────────────────────────────────────────────────────────────────┘
```

| Phần | Giá trị |
| --- | --- |
| Khung | Không có `AppHeader`. Nền `--app-color-page`. `ColorSchemeToggle` ở góc phải trên, giống `AuthLayout` |
| Cột nội dung | Căn trái như draft, `max-width: 520px`, padding `80px 80px` (≥ 992px) / `48px 24px` (< 768px) |
| Khoảng cách | Title → form `40px`. Giữa các ô `28px`. Ô cuối → nút `36px`. Hai nút cách nhau `12px` |
| Tiêu đề | `Title order={1}`, 28px / 600, màu `--mantine-color-bright` |
| Nhãn | 14px / 500. Dấu `*` dùng `withAsterisk`, màu `--mantine-color-error` (đã chỉnh contrast trong theme) |
| < 768px | Hai nút xếp dọc và giãn hết chiều ngang, "Create workspace" ở trên |
| Chưa có workspace | Giống hệt luồng tạo thêm. "Go back" đưa về `/` (trang chủ trống) |

### 4.2 Các ô và hành vi

| Ô | Cấu hình | Hành vi |
| --- | --- | --- |
| Name | `TextInput`, `maxLength={80}`, `autoFocus`, `autoComplete="organization"` | `onChange`: ghi `name`. Nếu slug **chưa bị sửa tay** thì ghi luôn `slug = slugify(name)` **ngay trong handler**. Không dùng `useEffect` để đồng bộ, vì làm vậy sẽ render thêm một lần và dễ ghi đè lên chỗ người dùng đang gõ |
| URL | `SlugInput`, `maxLength={48}`, `autoComplete="off"`, `spellCheck={false}`, `autoCapitalize="none"` | `onChange`: `normalizeSlugInput(value)` (bên dưới), đánh dấu `slugTouched = true`. Xoá trống ô thì `slugTouched = false`: lần gõ tên kế tiếp sẽ tự điền lại, nhưng **không** điền lại ngay, để người dùng xoá được rồi tự gõ (BA 5.2) |
| URL (dán) | `onPaste` | Lấy chuỗi từ clipboard. Có `/` thì chỉ giữ đoạn path **cuối cùng** khác rỗng (`https://app.openplany.dev/acme/` → `acme`), sau đó `normalizeSlugInput`. Gọi `preventDefault()` rồi tự ghi giá trị |
| Organization size | `Select`, `data={ORGANIZATION_SIZES}`, `allowDeselect={false}`, `searchable={false}`, `placeholder="Select a range"`, `checkIconPosition="right"` | 6 lựa chọn đúng thứ tự draft. Mở được bằng bàn phím (Mantine có sẵn) |

`normalizeSlugInput` (đặt trong web, dùng hàm trợ giúp của `@repo/contracts`), áp dụng **khi đang gõ**:

1. Bỏ dấu (NFKD, `đ` → `d`, bỏ `\p{M}`), chuyển chữ thường.
2. Khoảng trắng và `_` thành `-`.
3. Bỏ mọi ký tự không thuộc `[a-z0-9-]`.
4. **Không** bỏ `-` ở cuối và **không** gộp `--`, để người dùng gõ được `acme-team`. Các lỗi đó hiện khi rời ô hoặc khi bấm tạo (BA 5.2, AC 6).

### 4.3 `SlugInput`

Phần tiền tố có độ dài thay đổi theo host, nên **không** dùng `leftSection` của Mantine (vùng đó có chiều rộng cố định, dành cho icon). Thay vào đó:

```text
Input.Wrapper (label, description, error, withAsterisk)
└─ div.box  (viền và nền giống input: --mantine-color-default-border, --input-bg; :focus-within → viền primary)
   ├─ span.prefix   "{window.location.host}/"   chữ dimmed, không chọn được (user-select: none)
   └─ Input variant="unstyled"  (ô nhập thật, flex: 1)
```

- Lấy `window.location.host` một lần ở cấp module (A9). Không viết cứng `localhost:8080`.
- Bấm vào `.prefix` thì focus vào ô nhập.
- Màn hẹp: `.prefix` tối đa 45% chiều rộng. Bị cắt thì cắt **ở đầu** (`direction: rtl; text-overflow: ellipsis`), nên `…openplany.dev/` vẫn giữ phần sát slug.
- ARIA: `aria-describedby` trỏ tới cả `description` lẫn dòng trạng thái slug. `aria-invalid` khi có lỗi. Nhãn đọc lên là "Set your workspace's URL". Tiền tố không nằm trong giá trị của ô.

### 4.4 Kiểm tra slug: `useSlugAvailability(slug)`

```ts
type SlugStatus =
  | { kind: 'idle' }                          // rỗng, hoặc sai định dạng ở client
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'unavailable'; reason: 'RESERVED' | 'TAKEN' }
  | { kind: 'unknown' };                      // request lỗi (mạng, 5xx, 429)
```

1. `useDebouncedValue(slug, 300)` từ `@mantine/hooks`.
2. **Tính ngay trong lúc render**, không cần request (đây là state suy ra, không dùng effect):
   - Sai định dạng hoặc độ dài → `idle`. Lỗi định dạng do form hiện, không do hook này.
   - Có trong `RESERVED_WORKSPACE_SLUGS` → `unavailable/RESERVED` **ngay lập tức**, không chờ debounce.
3. Còn lại: một `useEffect` theo `debouncedSlug` gọi `checkSlug(debouncedSlug, controller.signal)`. Cleanup thì `abort()` (đây là đồng bộ với hệ thống bên ngoài, đúng chỗ dùng effect). Kết quả chỉ được dùng khi slug của nó **vẫn bằng** slug hiện tại. Request bị huỷ (`AbortError`) thì bỏ qua, không log.
4. Trong lúc `slug !== debouncedSlug` hoặc đang chờ request: `checking`, hiện `Loader size="xs"` và chữ "Checking…".
5. Request lỗi → `unknown`, không hiện gì và **không khoá nút tạo** (BA 5.3, AC 7). Lỗi được `console.warn` kèm slug để debug.
6. Lưu lại kết quả của slug vừa kiểm tra trong một `useRef` dạng `Map<slug, status>`. Gõ đi rồi quay lại slug cũ thì không gọi API lần nữa.

| Trạng thái | Dòng hiển thị (`aria-live="polite"`) |
| --- | --- |
| `checking` | ⟳ Checking… (dimmed) |
| `available` | ✓ Available (`--mantine-color-success`) |
| `unavailable/RESERVED` | "This URL is reserved. Choose another one." (hiện như `error` của ô) |
| `unavailable/TAKEN` | "This URL is already taken. Choose another one." (hiện như `error` của ô) |
| `idle`, `unknown` | Không hiện gì |

### 4.5 Kiểm tra form và nút "Create workspace"

- `useForm` (`@mantine/form`, `mode: 'controlled'`), `validateInputOnBlur: true`. Các luật lấy từ `@repo/contracts` và **giống hệt** DTO (API 5.2): tên 1–80 ký tự sau trim, không ký tự ẩn, không URL; slug 3–48 ký tự và đúng regex; quy mô thuộc danh sách.
- **Nút bật** khi: tên hợp lệ **và** slug đúng định dạng **và** slug không ở trạng thái `unavailable` **và** đã chọn quy mô **và** không đang gửi. Đang `checking` hay `unknown` thì vẫn bật được, vì server là nơi kiểm tra cuối cùng.
- Nút bị khoá thì `disabled` (giống nút Sign in). Đang gửi thì `loading` và khoá cả 3 ô (`readOnly`), để không gửi hai lần.

### 4.6 Gửi và xử lý kết quả

| Kết quả `POST` | Xử lý |
| --- | --- |
| `201` | `add(workspace)` → `navigate('/' + slug, { replace: true })`. Không cần toast, vì chuyển trang đã đủ báo thành công |
| `400 VALIDATION_ERROR` | `form.setErrors(error.fields)`, focus vào ô lỗi đầu tiên |
| `409 SLUG_ALREADY_EXISTS` | `form.setErrors({ slug })`, ghi `TAKEN` vào cache của 4.4 (bước 6), focus ô URL |
| `429 TOO_MANY_ATTEMPTS` | `Alert` màu đỏ phía trên các nút: "You've created several workspaces recently. Try again in {n} minutes." (n = làm tròn lên của `retryAfterSeconds / 60`) |
| `401` | `expireSession()`, `RequireAuth` tự chuyển về `/sign-in` |
| `403`, `5xx`, mất mạng | `Alert`: `error.message`, hoặc "Couldn't create the workspace. Please try again." Giữ nguyên dữ liệu đã nhập |

**"Go back"** (luôn hiện): nếu có lịch sử trong ứng dụng (`window.history.state?.idx > 0`, do react-router ghi) thì `navigate(-1)`; nếu không thì về `/` để `HomeRedirect` chọn workspace.

---

## 5. `WorkspaceSwitcher`

### 5.1 Header mới

```text
┌──────────────────────────────────────────────────────────────────────┐
│ [■A] Acme Corporation ⌄                        [◐] [(K) Kai Tran]    │  64px
└──────────────────────────────────────────────────────────────────────┘
  └── WorkspaceSwitcher ──┘                       └ ColorSchemeToggle, UserButton
```

Khi đang ở trong workspace, nút "Sign out" trên header được **bỏ** và chuyển vào menu, đúng draft (BA 4.2). Khi chưa có workspace thì head bar khác (mục 5.4).

### 5.2 Menu

```text
┌──────────────────────────────────────┐   Mantine Menu, width 300, position bottom-start
│ kai@openplany.dev                    │   Menu.Label, dimmed, cắt "…"
│ ┌──────────────────────────────────┐ │
│ │ [■A] Acme Corporation          ✓ │ │   workspace hiện tại: nền --mantine-color-default-hover
│ │      Owner · 1 member            │ │   aria-current="true"
│ └──────────────────────────────────┘ │
│  [■O] OpenStudy                      │   các workspace khác: bấm → navigate("/openstudy")
│       Admin · 5 members              │
│ ──────────────────────────────────── │   Menu.Divider
│  (+) Create workspace                │   → navigate("/create-workspace")
│  [⎋] Sign out                        │   color="red" → signOut()
└──────────────────────────────────────┘
```

| Phần | Giá trị |
| --- | --- |
| Trigger | `UnstyledButton`: `WorkspaceAvatar` 28px + tên 15px / 600 (tối đa 200px, cắt `…`) + chevron 14px. Hover: nền `--mantine-color-default-hover`. `aria-label="Switch workspace – {tên}"`. Mantine `Menu.Target` tự thêm `aria-haspopup` và `aria-expanded` |
| `WorkspaceAvatar` | Mantine `Avatar radius="sm"`, `variant="filled"`, nền `backgroundColor` của workspace, chữ trắng (mọi màu đạt ≥ 5.18:1). Chữ cái = ký tự đầu tiên của tên, viết hoa, lấy bằng `Array.from(name.trim())[0]` để không cắt đôi emoji. Ở chế độ tối có viền 1px `--app-color-border`, vì màu `#0F172A` trùng nền tối |
| Dòng phụ | `{Owner|Admin|Member|Guest} · {n} member(s)`. 13px, dimmed. Vai trò hiển thị đúng dữ liệu (Q1) |
| Danh sách dài | Các workspace nằm trong `ScrollArea.Autosize mah={320}`. Phần nhãn email và các hành động luôn hiện |
| Ẩn trong đợt này | "Settings", "Invite members", "Workspace invites" (Q4) |
| Chuyển workspace | Đóng menu rồi `navigate('/' + slug)`. `WorkspaceLayout` lo việc gọi API (mục 2) |
| Bàn phím | Mantine `Menu`: ↑/↓ di chuyển, Enter chọn, Esc đóng và trả focus về trigger. Có `loop` |
| `title` | Mỗi mục có `title="{origin}/{slug}"` để phân biệt hai workspace trùng tên (BA 5.1) |

### 5.3 Icon

Dự án chưa có thư viện icon. Cần 4 icon (chevron, check, plus, sign-out), vẽ bằng SVG inline 16px, `stroke="currentColor"`, `aria-hidden="true"`, đặt trong `features/workspaces/icons.tsx`. Đó là cùng cách `ColorSchemeToggle` đang làm với icon mặt trời và mặt trăng (W4).

### 5.4 Head bar khi chưa có workspace (BA 4.3)

```text
≥ 576px
┌──────────────────────────────────────────────────────────────────────────┐
│ [logo 32] [ Create workspace + ]              [◐] [(K) Kai Tran] [Sign out] │  64px
└──────────────────────────────────────────────────────────────────────────┘

< 576px
┌──────────────────────────────────────────────┐
│ [logo] [+]              [◐] [(K)] [Sign out] │
└──────────────────────────────────────────────┘
```

**Quy tắc hiển thị của `AppHeader`** (đọc `useWorkspaces()` và workspace hiện tại, nếu đang ở trong `WorkspaceLayout`):

| Ngữ cảnh | Bên trái | Bên phải |
| --- | --- | --- |
| Trong `/:workspaceSlug` | `WorkspaceSwitcher` | `ColorSchemeToggle`, `UserButton` |
| Ở `/`, danh sách **đã tải xong và rỗng** | Logo OpenPlany + `CreateWorkspaceButton` | `ColorSchemeToggle`, `UserButton`, nút "Sign out" |
| Ở `/`, đang tải hoặc lỗi | Chỉ logo (không hiện nút, tránh chớp) | `ColorSchemeToggle`, `UserButton`, nút "Sign out" |

**`CreateWorkspaceButton`:**

| Phần | Giá trị |
| --- | --- |
| Phần tử | `Button component={Link} to="/create-workspace"`: là **link**, nên mở được trong tab mới và screen reader đọc là "link" |
| Kiểu | `size="xs"`, `variant="filled"` (màu primary: Cyber Black ở chế độ sáng, Electric Yellow ở chế độ tối), `rightSection` là icon `+` 14px. Cao 30px, cùng chiều cao với nút "Sign out" |
| Nhãn | "Create workspace" + icon `+` |
| < 576px | Chỉ hiện icon: `ActionIcon component={Link}` cùng màu, `aria-label="Create workspace"`, `title="Create workspace"`. Chuyển bằng `visibleFrom="xs"` / `hiddenFrom="xs"` của Mantine, không đổi bằng JavaScript |
| Khoảng cách | Cách logo `12px` |

**`NoWorkspaceHome`** (thân trang `/` khi chưa có workspace):

```text
            ┌──────────────────────────────────────────┐
            │      You're not in a workspace yet       │  Title order 1, 22/600, căn giữa
            │  Create one to start planning, or ask    │  16px dimmed, max-width 420px
            │  your admin to invite you.               │
            │           [ Create workspace ]           │  Button md, link tới /create-workspace
            └──────────────────────────────────────────┘
```

- Căn giữa theo chiều ngang, cách head bar `96px` (màn hẹp: `48px`). Nền `--app-color-page`, không có card.
- Head bar và thân trang có hai nút cùng đích. Đây là chủ ý: nút ở head bar luôn nằm cùng một chỗ, còn nút ở thân trang là lời gọi hành động chính của trang trống.

---

## 6. Văn bản trên UI

| Chỗ | Văn bản |
| --- | --- |
| Tiêu đề trang | Create your workspace |
| Nhãn / placeholder tên | Name your workspace / Something familiar and recognizable is always best. |
| Nhãn / placeholder URL | Set your workspace's URL / Type or paste a URL |
| Mô tả dưới URL | You can't change this URL later. |
| Nhãn / placeholder quy mô | How many people will use this workspace? / Select a range |
| Nút | Create workspace · Go back |
| Nút trên head bar | Create workspace + (màn hẹp: chỉ icon, `aria-label` "Create workspace") |
| Trang chủ trống | You're not in a workspace yet · Create one to start planning, or ask your admin to invite you. · Create workspace |
| Lỗi | Lấy nguyên văn từ BA 5.1 / API 5.2 (dùng chung một bộ hằng số với API, đặt trong `@repo/contracts`) |
| Trang 404 | Workspace not found · It doesn't exist or you don't have access. · Go to my workspaces |
| Lỗi tải danh sách | Couldn't load your workspaces. · Try again |

---

## 7. Sáng/tối và khả năng truy cập

- Chỉ dùng token: `--app-color-page`, `--app-color-surface`, `--mantine-color-dimmed`, `--mantine-color-error`, `--mantine-color-success`, `--mantine-color-default-border`, `--mantine-primary-color-filled`. **Không** viết cứng mã màu, trừ màu của avatar lấy từ dữ liệu.
- Nút "Create workspace" dùng màu `primary` của theme: Cyber Black ở chế độ sáng, Electric Yellow ở chế độ tối. Trạng thái disabled dùng màu disabled của Mantine.
- Focus nhìn thấy được trên mọi phần tử (`:focus-visible` của Mantine). `SlugInput` dùng `:focus-within` cho `.box`.
- Mọi ô có nhãn thật (`label`), không chỉ dựa vào placeholder.
- Dòng trạng thái slug dùng `aria-live="polite"`, nên screen reader đọc "Available" khi kết quả về mà không cắt ngang người dùng đang gõ.
- Ở 375px: không cuộn ngang, nút cao tối thiểu 42px, menu Switcher không vượt màn hình (`width: min(300px, calc(100vw - 32px))`).

---

## 8. Test (Vitest + RTL, bọc trong `AppUiProvider` + `MemoryRouter`, `mockFetch`, fake timer cho debounce)

| # | File | Kịch bản (theo AC trong BA mục 9) |
| --- | --- | --- |
| 1 | `CreateWorkspaceForm.test.tsx` | Gõ "OpenPlany Dev Team" → ô URL là `openplany-dev-team`. Qua 300 ms thì gọi `GET …/slug-check?slug=openplany-dev-team` đúng **một** lần, rồi hiện "Available" (AC 1) |
| 2 | ″ | "Công ty Đầu tư Ánh Dương" → `cong-ty-dau-tu-anh-duong` (AC 2) |
| 3 | ″ | Sửa tay ô URL thành `acme`, gõ tiếp tên → URL vẫn `acme`. Xoá trống URL rồi gõ tên → URL đồng bộ lại (AC 3) |
| 4 | ″ | Gõ `admin` → hiện lỗi bảo lưu ngay, **không** gọi API, nút bị khoá (AC 4) |
| 5 | ″ | API trả `TAKEN` → lỗi "already taken", nút bị khoá (AC 4) |
| 6 | ″ | Dán `https://app.openplany.dev/acme/` → `acme` (AC 5) |
| 7 | ″ | `-acme` / `acme--team` / `ab`: báo lỗi khi rời ô (AC 6) |
| 8 | ″ | `slug-check` lỗi mạng → nút vẫn bật khi đủ 3 ô (AC 7) |
| 9 | ″ | Gõ nhanh `a` → `ab` → `abc` trong vòng 300 ms → chỉ một request (`abc`). Request cũ bị `abort` |
| 10 | `CreateWorkspaceRoute.test.tsx` | Submit `201` → điều hướng tới `/acme-corp`, danh sách trong provider có workspace mới (AC 8) |
| 11 | ″ | `409` → lỗi dưới ô URL, focus ô URL. `429` → Alert có số phút. `400` → lỗi theo `fields` |
| 12 | ″ | "Go back" khi mở thẳng URL (không có lịch sử) → về `/` |
| 13 | `HomeRedirect.test.tsx` | 0 workspace → ở lại `/`, thấy trang chủ trống. Có `lastWorkspaceSlug` → `/openplany`. Không có → workspace đầu tiên (AC 13, 14) |
| 14 | `AppHeader.test.tsx` | 0 workspace: có **link** "Create workspace" (role `link`) và nút Sign out; bấm link → `/create-workspace` (AC 13). Có workspace: không có link này. Đang tải danh sách: không có link này (AC 17) |
| 15 | `WorkspaceSwitcher.test.tsx` | Mở bằng bàn phím: thấy email, workspace hiện tại có `aria-current`, workspace khác, "Create workspace", "Sign out". **Không** có Settings, Invite, Workspace invites (AC 15) |
| 16 | ″ | Chọn workspace khác → điều hướng. "Sign out" → gọi `signOut` |
| 17 | `WorkspaceLayout.test.tsx` | `GET /:slug` trả `404` → trang "Workspace not found" (AC 16). `401` → `expireSession` |

Truy vấn phần tử theo role và label (CLAUDE.md), không dùng test id. Debounce kiểm tra bằng `vi.useFakeTimers()` + `vi.advanceTimersByTime(300)`.

---

## 9. Câu hỏi cần chốt (bổ sung)

| # | Câu hỏi | Đề xuất |
| --- | --- | --- |
| W1 | Trang `/create-workspace` có header (Switcher) hay là trang trống như draft? | Trang trống như draft, có thêm `ColorSchemeToggle`. Muốn rời trang thì dùng "Go back" |
| W2 | Bỏ lượt chờ `session → workspaces` khi tải lần đầu (gọi hai API song song)? | Chưa làm ở MVP. Nếu cần thì gọi `workspaceApi.list()` cùng lúc với `getSession()` trong `AuthProvider` và bỏ qua `401`. Cách này làm hai provider dính vào nhau, nên đợi đo được độ trễ thật rồi quyết |
| W3 | Dùng TanStack Query cho danh sách workspace và kiểm tra slug (có cache, khử trùng request)? | Nên dùng khi có thêm project/issue. **Dependency mới, phải hỏi.** Đợt này dùng context + `useRef` cache |
| W4 | Thêm `@tabler/icons-react` (bộ icon Mantine khuyên dùng)? | Chưa. 4 icon SVG inline là đủ. Xem lại khi cần trên 10 icon. Dependency mới, phải hỏi |
| W5 | Sau khi tạo có hiện toast "Workspace created" không? | Không. Chuyển ngay vào workspace mới đã là phản hồi đủ rõ |
| W6 | Có gợi ý slug thay thế khi bị trùng (`acme-2`, `acme-hq`) không? | Chưa. Theo dõi chỉ số tỷ lệ `TAKEN` (BA 13) rồi quyết |
