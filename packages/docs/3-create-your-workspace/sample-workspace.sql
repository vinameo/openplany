create table if not exists public.workspaces
(
    created_at        timestamp with time zone not null,
    updated_at        timestamp with time zone not null,
    id                uuid                     not null
        constraint workspace_pkey
            primary key,
    name              varchar(80)              not null,
    logo              text,
    slug              varchar(48)              not null
        constraint workspace_slug_key
            unique,
    created_by_id     uuid
        constraint workspace_created_by_id_10ad894e_fk_user_id
            references public.users
            deferrable initially deferred,
    owner_id          uuid                     not null
        constraint workspace_owner_id_60a8bafc_fk_user_id
            references public.users
            deferrable initially deferred,
    updated_by_id     uuid
        constraint workspace_updated_by_id_09d249ed_fk_user_id
            references public.users
            deferrable initially deferred,
    organization_size varchar(20),
    deleted_at        timestamp with time zone,
    logo_asset_id     uuid
        constraint workspaces_logo_asset_id_a784bb00_fk_file_assets_id
            references public.file_assets
            deferrable initially deferred,
    timezone          varchar(255)             not null,
    background_color  varchar(255)             not null
);

create table if not exists public.file_assets
(
    created_at        timestamp with time zone not null,
    updated_at        timestamp with time zone not null,
    id                uuid                     not null
        constraint file_asset_pkey
            primary key,
    attributes        jsonb                    not null,
    asset             varchar(800)             not null,
    created_by_id     uuid
        constraint file_asset_created_by_id_966942a0_fk_user_id
            references public.users
            deferrable initially deferred,
    updated_by_id     uuid
        constraint file_asset_updated_by_id_d6aaf4f0_fk_user_id
            references public.users
            deferrable initially deferred,
    workspace_id      uuid
        constraint file_assets_workspace_id_fa50b9c5_fk_workspaces_id
            references public.workspaces
            deferrable initially deferred,
    is_deleted        boolean                  not null,
    deleted_at        timestamp with time zone,
    is_archived       boolean                  not null,
    comment_id        uuid
        constraint file_assets_comment_id_35d4ecaf_fk_issue_comments_id
            references public.issue_comments
            deferrable initially deferred,
    entity_type       varchar(255),
    external_id       varchar(255),
    external_source   varchar(255),
    is_uploaded       boolean                  not null,
    issue_id          uuid
        constraint file_assets_issue_id_cfe87d6c_fk_issues_id
            references public.issues
            deferrable initially deferred,
    page_id           uuid
        constraint file_assets_page_id_64c753d1_fk_pages_id
            references public.pages
            deferrable initially deferred,
    project_id        uuid
        constraint file_assets_project_id_ebd5c0d8_fk_projects_id
            references public.projects
            deferrable initially deferred,
    size              double precision         not null,
    storage_metadata  jsonb,
    user_id           uuid
        constraint file_assets_user_id_ce1818dc_fk_users_id
            references public.users
            deferrable initially deferred,
    draft_issue_id    uuid
        constraint file_assets_draft_issue_id_52633145_fk_draft_issues_id
            references public.draft_issues
            deferrable initially deferred,
    entity_identifier varchar(255)
);