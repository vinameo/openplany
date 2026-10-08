-- Schema cho tính năng Tạo Workspace (PostgreSQL 17).
-- Đồng bộ với "3 - database-spec.md" mục 3; migration CreateWorkspaceTables chạy đúng các câu này.
-- Yêu cầu bảng users đã có (migration CreateAuthTables).
--
-- Chạy thử mà không để lại gì (trong psql):
--   BEGIN;
--   \i sample-workspace.sql
--   ROLLBACK;

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------
CREATE TABLE workspaces (
    id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    name              varchar(80)   NOT NULL,
    slug              varchar(48)   NOT NULL,
    logo              text,                                   -- URL; chưa dùng (chưa có module lưu trữ file)
    owner_id          uuid          NOT NULL REFERENCES users (id),
    created_by_id     uuid          REFERENCES users (id),
    updated_by_id     uuid          REFERENCES users (id),
    organization_size varchar(20)   NOT NULL,
    timezone          varchar(255)  NOT NULL DEFAULT 'UTC',  -- sao chép từ users.user_timezone của người tạo
    background_color  varchar(7)    NOT NULL,                -- '#RRGGBB' viết hoa, chọn theo hash của id
    created_at        timestamptz   NOT NULL DEFAULT now(),
    updated_at        timestamptz   NOT NULL DEFAULT now(),
    deleted_at        timestamptz,                            -- xoá mềm (tính năng sau)

    -- Toàn bảng, kể cả workspace đã xoá: slug không bao giờ được dùng lại.
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

-- PostgreSQL không tự tạo index cho cột FK.
CREATE INDEX idx_workspaces_owner_id ON workspaces (owner_id);
-- Luật tần suất: tối đa 5 workspace / 1 giờ / người tạo.
CREATE INDEX idx_workspaces_created_by_created_at ON workspaces (created_by_id, created_at);

-- ---------------------------------------------------------------------------
-- workspace_members
-- ---------------------------------------------------------------------------
CREATE TABLE workspace_members (
    id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid         NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    member_id    uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role         varchar(20)  NOT NULL DEFAULT 'member',     -- người tạo được ghi 'owner' tường minh
    is_active    boolean      NOT NULL DEFAULT true,          -- rời đi = false; quay lại = bật lại cùng dòng
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT workspace_members_workspace_member_key UNIQUE (workspace_id, member_id),
    CONSTRAINT workspace_members_role_check CHECK (role IN ('owner', 'admin', 'member', 'guest'))
);

-- "Workspace của tôi": truy vấn phải có đúng điều kiện is_active = true.
CREATE INDEX idx_workspace_members_member_id_active
    ON workspace_members (member_id) WHERE is_active = true;

-- Mỗi workspace có tối đa một owner.
CREATE UNIQUE INDEX workspace_members_one_owner_key
    ON workspace_members (workspace_id) WHERE role = 'owner';

-- ---------------------------------------------------------------------------
-- users.last_workspace_id: workspace mở gần nhất, dùng để điều hướng sau khi đăng nhập
-- ---------------------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN last_workspace_id uuid REFERENCES workspaces (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- down (chỉ dùng ở môi trường dev, xoá toàn bộ dữ liệu workspace)
-- ---------------------------------------------------------------------------
-- ALTER TABLE users DROP COLUMN IF EXISTS last_workspace_id;
-- DROP TABLE IF EXISTS workspace_members;
-- DROP TABLE IF EXISTS workspaces;
