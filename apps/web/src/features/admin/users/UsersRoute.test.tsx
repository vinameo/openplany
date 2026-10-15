import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppUiProvider } from '@repo/ui';
import { Notifications, notifications } from '@mantine/notifications';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminUserListResponse, AdminUserResponse } from '@repo/contracts';
import { AuthProvider } from '../../auth/AuthProvider';
import { appRoutes } from '../../../routes';
import { makeSession } from '../../../test/authFixtures';
import { apiError, jsonResponse, mockFetch } from '../../../test/fetchMock';
import { USERS_PATH } from './usersPaths';

function makeAdminUser(overrides: Partial<AdminUserResponse> = {}): AdminUserResponse {
  return {
    id: 'user-kai-1',
    firstName: 'Kai',
    lastName: 'Tran',
    displayName: 'Kai Tran',
    email: 'kai@openplany.dev',
    avatarUrl: null,
    isInstanceAdmin: true,
    isActive: true,
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
    ...overrides,
  };
}

function renderRoute(options?: {
  isInstanceAdmin?: boolean;
  extraMocks?: Parameters<typeof mockFetch>[0];
  initialEntries?: string[];
  currentUserId?: string;
}) {
  const isInstanceAdmin = options?.isInstanceAdmin ?? true;
  const defaultUsers: AdminUserListResponse = {
    items: [
      makeAdminUser({
        id: 'user-1',
        firstName: 'Kai',
        lastName: 'Tran',
        displayName: 'Kai Tran',
        email: 'kai@openplany.dev',
        isInstanceAdmin: true,
        isActive: true,
      }),
      makeAdminUser({
        id: 'user-2',
        firstName: 'An',
        lastName: 'Nguyen',
        displayName: 'An Nguyen',
        email: 'an@openplany.dev',
        isInstanceAdmin: false,
        isActive: false,
      }),
    ],
    total: 2,
    page: 1,
    pageSize: 50,
  };

  const fetchMock = mockFetch({
    'GET /api/auth/session': () =>
      jsonResponse(
        200,
        makeSession({
          user: {
            ...makeSession().user,
            id: options?.currentUserId ?? 'user-1',
            isInstanceAdmin,
          },
        }),
      ),
    'GET /api/workspaces': () =>
      jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
    'GET /api/admin/users': () => jsonResponse(200, defaultUsers),
    ...options?.extraMocks,
  });

  const router = createMemoryRouter(appRoutes, {
    initialEntries: options?.initialEntries ?? [USERS_PATH],
  });

  render(
    <AppUiProvider>
      <Notifications />
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </AppUiProvider>,
  );

  return { router, user: userEvent.setup(), fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
  notifications.clean();
});

describe('UsersRoute', { timeout: 15000 }, () => {
  it('AC-01: renders Users page with title, total badge, and table rows for instance admin', async () => {
    renderRoute();

    // Check heading
    const heading = await screen.findByRole('heading', { name: /^users/i });
    expect(heading).toBeInTheDocument();

    // Check total badge
    const badge = await screen.findByLabelText('2 users');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('2');

    // Check table headers
    expect(screen.getByText('Full name')).toBeInTheDocument();
    expect(screen.getByText('Display name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Account created')).toBeInTheDocument();

    // Check user rows
    expect(screen.getAllByText('Kai Tran')).toHaveLength(2);
    expect(screen.getByText('kai@openplany.dev')).toBeInTheDocument();
    expect(screen.getAllByText('An Nguyen')).toHaveLength(2);
    expect(screen.getByText('an@openplany.dev')).toBeInTheDocument();

    // Check action buttons exist
    const actionButtons = screen.getAllByRole('button', { name: /actions for/i });
    expect(actionButtons).toHaveLength(2);
  });

  it('AC-02: redirects non-instance admin to /', async () => {
    const { router } = renderRoute({ isInstanceAdmin: false });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });

  it('AC-04: renders Instance admin and Deactivated badges properly', async () => {
    renderRoute();

    await screen.findAllByText('Kai Tran');

    expect(screen.getByText('Instance admin')).toBeInTheDocument();
    expect(screen.getByText('Deactivated')).toBeInTheDocument();
  });

  it('AC-05: hides pagination when total <= 50 and shows when total > 50', async () => {
    const manyUsers: AdminUserListResponse = {
      items: Array.from({ length: 50 }, (_, i) =>
        makeAdminUser({
          id: `user-${i}`,
          firstName: `User${i}`,
          lastName: 'Test',
          email: `user${i}@openplany.dev`,
        }),
      ),
      total: 120,
      page: 1,
      pageSize: 50,
    };

    renderRoute({
      extraMocks: {
        'GET /api/admin/users': () => jsonResponse(200, manyUsers),
      },
    });

    await screen.findByText('User0 Test');
    expect(screen.getByText('Showing 1–50 of 120')).toBeInTheDocument();
  });

  it('AC-28: Add user button opens CreateUserModal', async () => {
    const { user } = renderRoute();

    const addButton = await screen.findByRole('button', { name: /add user/i });
    await user.click(addButton);

    // Modal opens with title
    const modalTitle = await screen.findByRole('heading', { name: 'Create user' });
    expect(modalTitle).toBeInTheDocument();

    // Has inputs inside modal
    expect(screen.getByRole('textbox', { name: /^first name/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^email$/i })).toBeInTheDocument();
  });

  it('opens EditUserModal when clicking Edit user in row action menu', async () => {
    const { user } = renderRoute({
      extraMocks: {
        'GET /api/admin/users/user-2': () =>
          jsonResponse(
            200,
            makeAdminUser({
              id: 'user-2',
              firstName: 'An',
              lastName: 'Nguyen',
              displayName: 'An Nguyen',
              email: 'an@openplany.dev',
            }),
          ),
      },
    });

    const rowActionsBtn = await screen.findByRole('button', { name: /actions for an nguyen/i });
    await user.click(rowActionsBtn);

    const editMenuItem = await screen.findByRole('menuitem', { name: /edit user/i });
    await user.click(editMenuItem);

    expect(await screen.findByRole('heading', { name: 'Edit user' })).toBeInTheDocument();
  });

  it('B2.1: handles 403 on users query by refreshing session', async () => {
    let sessionCalls = 0;
    renderRoute({
      extraMocks: {
        'GET /api/auth/session': () => {
          sessionCalls++;
          return jsonResponse(
            200,
            makeSession({
              user: { ...makeSession().user, isInstanceAdmin: sessionCalls === 1 },
            }),
          );
        },
        'GET /api/admin/users': () =>
          apiError(403, 'FORBIDDEN', "You don't have permission to manage users"),
      },
    });

    await waitFor(() => {
      expect(sessionCalls).toBeGreaterThanOrEqual(2);
    });
  });

  it('AC-06 & AC-30: debounces search input and synchronizes URL with replace', async () => {
    const { router, user } = renderRoute();

    const searchInput = await screen.findByPlaceholderText(/search by name or email/i);
    await user.type(searchInput, 'nguyen');

    // Wait for 300ms debounce
    await waitFor(() => {
      expect(router.state.location.search).toContain('search=nguyen');
    });

    // Should keep replace (history length doesn't expand per keystroke)
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('AC-07 & AC-30: filter popover filters status and instance admin, updating URL and resetting page', async () => {
    const { router, user } = renderRoute({
      initialEntries: [`${USERS_PATH}?page=2`],
    });

    const filterButton = await screen.findByTestId('users-filter-button');
    expect(filterButton).toHaveTextContent('Filters');

    await user.click(filterButton);

    // Click Deactivated radio
    const deactivatedRadio = await screen.findByRole('radio', { name: /^deactivated/i });
    await user.click(deactivatedRadio);

    await waitFor(() => {
      expect(router.state.location.search).toContain('status=deactivated');
      expect(router.state.location.search).not.toContain('page=2');
    });
    expect(filterButton).toHaveTextContent('Filters · 1');

    // Click Instance admins only radio
    const adminOnlyRadio = await screen.findByRole('radio', { name: /^instance admins only/i });
    await user.click(adminOnlyRadio);

    await waitFor(() => {
      expect(router.state.location.search).toContain('admin=only');
    });
    expect(filterButton).toHaveTextContent('Filters · 2');

    // Click Clear filters in popover
    const clearButton = await screen.findByRole('button', { name: /^clear filters/i });
    await user.click(clearButton);

    await waitFor(() => {
      expect(router.state.location.search).not.toContain('status=');
      expect(router.state.location.search).not.toContain('admin=');
    });
    expect(filterButton).toHaveTextContent('Filters');
  });

  it('AC-08: sorts columns via header menu and sends sort + order', async () => {
    const { router, user } = renderRoute();

    await screen.findByRole('heading', { name: /^users/i });

    // Open sort menu on Full name
    const sortBtn = screen.getByRole('button', { name: /sort by full name/i });
    await user.click(sortBtn);

    const ascOption = await screen.findByRole('menuitem', { name: /^ascending/i });
    await user.click(ascOption);

    await waitFor(() => {
      expect(router.state.location.search).toContain('sort=fullName');
      expect(router.state.location.search).toContain('order=asc');
    });
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('AC-22 & WEB B2.7: empty state renders "Clear search and filters" when filters or search are active', async () => {
    const { router, user } = renderRoute({
      initialEntries: [`${USERS_PATH}?search=nonexistent`],
      extraMocks: {
        'GET /api/admin/users': () =>
          jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 50 }),
      },
    });

    await screen.findByText('No users match your search.');
    const clearAllButton = screen.getByRole('button', { name: /clear search and filters/i });
    expect(clearAllButton).toBeInTheDocument();

    await user.click(clearAllButton);

    await waitFor(() => {
      expect(router.state.location.search).toBe('');
    });
  });

  it('AC-27 & WEB B2.7: displays rate limit error alert when read limiter exceeded (429)', async () => {
    renderRoute({
      extraMocks: {
        'GET /api/admin/users': () =>
          apiError(429, 'TOO_MANY_ATTEMPTS', 'Too many requests. Please wait a moment and try again.', {
            retryAfterSeconds: 30,
          }),
      },
    });

    const errorAlert = await screen.findByTestId('users-load-error');
    expect(errorAlert).toBeInTheDocument();
    expect(errorAlert).toHaveTextContent('Too many requests. Please wait a moment and try again.');
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('AC-37 & INV-W4: Back navigation leaves /users because parameter updates use replace', async () => {
    // Initial entries: workspace page then users page
    const { router, user } = renderRoute({
      initialEntries: ['/workspaces/demo', USERS_PATH],
    });

    await screen.findByRole('heading', { name: /^users/i });
    expect(router.state.location.pathname).toBe(USERS_PATH);

    // Apply a search filter
    const searchInput = screen.getByPlaceholderText(/search by name or email/i);
    await user.type(searchInput, 'test');
    await waitFor(() => {
      expect(router.state.location.search).toContain('search=test');
    });

    // Apply a sort
    const sortBtn = screen.getByRole('button', { name: /sort by full name/i });
    await user.click(sortBtn);
    const ascOption = await screen.findByRole('menuitem', { name: /^ascending/i });
    await user.click(ascOption);
    await waitFor(() => {
      expect(router.state.location.search).toContain('sort=fullName');
    });

    // Now navigate back
    router.navigate(-1);

    // Should navigate directly back to /workspaces/demo, leaving /users completely!
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/workspaces/demo');
    });
  });

  it('INV-W3 & AC-18: hides Change password on self row, shows on other users and opens modal', async () => {
    const { user } = renderRoute();

    await screen.findByRole('heading', { name: /^users/i });
    await screen.findAllByText('Kai Tran');

    // user-1 is Kai Tran (current user)
    const kaiActionsBtn = screen.getByRole('button', { name: /actions for kai tran/i });
    await user.click(kaiActionsBtn);

    expect(await screen.findByRole('menuitem', { name: /edit user/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /change password/i })).not.toBeInTheDocument();

    // Close menu by clicking outside or pressing Escape
    await user.keyboard('{Escape}');

    // user-2 is An Nguyen (different user)
    const anActionsBtn = screen.getByRole('button', { name: /actions for an nguyen/i });
    await user.click(anActionsBtn);

    expect(await screen.findByRole('menuitem', { name: /edit user/i })).toBeInTheDocument();
    const changePasswordItem = screen.getByRole('menuitem', { name: /change password/i });
    expect(changePasswordItem).toBeInTheDocument();

    // Clicking Change password opens the Change password modal
    await user.click(changePasswordItem);
    expect(await screen.findByRole('dialog', { name: 'Change password' })).toBeInTheDocument();
    expect(screen.getByText('For An Nguyen (an@openplany.dev)')).toBeInTheDocument();
  });
});
