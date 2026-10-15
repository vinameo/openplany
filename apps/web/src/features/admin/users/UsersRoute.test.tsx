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
          user: { ...makeSession().user, isInstanceAdmin },
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

    // Has inputs
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
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
});
