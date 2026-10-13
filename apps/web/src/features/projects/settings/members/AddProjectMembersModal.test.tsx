import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Notifications, notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppUiProvider } from '@repo/ui';
import type { ProjectMemberCandidate, ProjectRole } from '@repo/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, jsonResponse, mockFetch } from '../../../../test/fetchMock';
import { AddProjectMembersModal } from './AddProjectMembersModal';

function renderModal({
  opened = true,
  onClose = vi.fn(),
  slug = 'ws-1',
  identifier = 'P1',
  addableRoles = ['admin', 'contributor', 'commenter', 'guest'] as ProjectRole[],
  canSeeEmail = true,
  onSubmit = vi.fn().mockResolvedValue({ kind: 'done' as const }),
}: {
  opened?: boolean;
  onClose?: () => void;
  slug?: string;
  identifier?: string;
  addableRoles?: ProjectRole[];
  canSeeEmail?: boolean;
  onSubmit?: () => Promise<{ kind: 'done' }>;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <AppUiProvider>
        <Notifications />
        <AddProjectMembersModal
          opened={opened}
          onClose={onClose}
          slug={slug}
          identifier={identifier}
          addableRoles={addableRoles}
          canSeeEmail={canSeeEmail}
          onSubmit={onSubmit}
        />
      </AppUiProvider>
    </QueryClientProvider>,
  );

  return { ...result, onClose, queryClient, onSubmit };
}

afterEach(() => {
  vi.unstubAllGlobals();
  notifications.clean();
});

const candidates: ProjectMemberCandidate[] = [
  {
    userId: 'u-alice',
    email: 'alice@openplany.dev',
    firstName: 'Alice',
    lastName: 'Smith',
    displayName: 'Alice Smith',
    avatarUrl: null,
    status: 'addable',
    addableRoles: ['admin', 'contributor', 'commenter', 'guest'],
  },
  {
    userId: 'u-hoa',
    email: 'hoa@openplany.dev',
    firstName: 'Hoa',
    lastName: 'Le',
    displayName: 'Hoa Le',
    avatarUrl: null,
    status: 'already_member',
    addableRoles: [],
  },
  {
    userId: 'u-kai',
    email: 'kai@openplany.dev',
    firstName: 'Kai',
    lastName: 'Tran',
    displayName: 'Kai Tran',
    avatarUrl: null,
    status: 'workspace_admin',
    addableRoles: [],
  },
  {
    userId: 'u-binh',
    email: 'binh@openplany.dev',
    firstName: 'Binh',
    lastName: 'Pham',
    displayName: 'Binh Pham',
    avatarUrl: null,
    status: 'addable',
    addableRoles: ['guest'],
  },
  {
    userId: 'u-admin-cli',
    email: 'admin@localhost',
    firstName: 'Admin',
    lastName: 'Local',
    displayName: 'Admin Local',
    avatarUrl: null,
    status: 'addable',
    addableRoles: ['admin', 'contributor', 'commenter', 'guest'],
  },
];

describe('AddProjectMembersModal', () => {
  it('AC-08: does not call API when query is too short or not a full email in exact mode', async () => {
    let fetchCount = 0;
    mockFetch({
      'GET /api/workspaces/ws-1/projects/P1/member-candidates': () => {
        fetchCount += 1;
        return jsonResponse(200, { candidates });
      },
    });

    const user = userEvent.setup();

    // 1. In contains mode: typing 1 char shows "Type at least 3 characters"
    const { unmount } = renderModal({ canSeeEmail: true });
    const inputContains = screen.getByRole('textbox', { name: 'Email' });
    await user.type(inputContains, 'a');
    expect(screen.getByText('Type at least 3 characters')).toBeInTheDocument();
    expect(fetchCount).toBe(0);

    // type 2 more chars
    await user.type(inputContains, 'li');
    await waitFor(() => {
      expect(screen.getByText('alice@openplany.dev')).toBeInTheDocument();
    });
    expect(fetchCount).toBeGreaterThan(0);
    unmount();

    // 2. In exact mode: typing partial email shows "Type the full email address"
    fetchCount = 0;
    renderModal({ canSeeEmail: false });
    const inputExact = screen.getByRole('textbox', { name: 'Email' });
    await user.type(inputExact, 'alice@');
    expect(screen.getByText('Type the full email address')).toBeInTheDocument();
    expect(fetchCount).toBe(0);

    // type full email
    await user.type(inputExact, 'openplany.dev');
    await waitFor(() => {
      expect(screen.getByText('alice@openplany.dev')).toBeInTheDocument();
    });
    expect(fetchCount).toBeGreaterThan(0);
  });

  it('AC-10: shows dimmed labels for already member and workspace admin', async () => {
    mockFetch({
      'GET /api/workspaces/ws-1/projects/P1/member-candidates': () =>
        jsonResponse(200, { candidates }),
    });

    const user = userEvent.setup();
    renderModal();

    const input = screen.getByRole('textbox', { name: 'Email' });
    await user.type(input, 'test');

    await waitFor(() => {
      expect(screen.getByText('Already in this project')).toBeInTheDocument();
      expect(screen.getByText('Workspace Admin · has access')).toBeInTheDocument();
    });

    const alreadyMemberOption = screen.getByRole('option', { name: /hoa@openplany\.dev/i });
    expect(alreadyMemberOption).toHaveAttribute('data-combobox-disabled', 'true');

    const wsAdminOption = screen.getByRole('option', { name: /kai@openplany\.dev/i });
    expect(wsAdminOption).toHaveAttribute('data-combobox-disabled', 'true');
  });

  it('AC-13: clamps role and displays notice when candidate workspace role restricts project role', async () => {
    mockFetch({
      'GET /api/workspaces/ws-1/projects/P1/member-candidates': () =>
        jsonResponse(200, { candidates }),
    });

    const user = userEvent.setup();
    renderModal();

    // Initial role is Contributor (DEFAULT_ADDED_PROJECT_ROLE)
    const roleSelect = screen.getByRole('combobox', { name: 'Role' });
    expect(roleSelect).toHaveValue('Contributor');

    const input = screen.getByRole('textbox', { name: 'Email' });
    await user.type(input, 'binh');

    await waitFor(() => {
      expect(screen.getByText('binh@openplany.dev')).toBeInTheDocument();
    });

    // Select Binh (workspace guest)
    await user.click(screen.getByRole('option', { name: /binh@openplany\.dev/i }));

    // Role lowered to Guest automatically
    expect(roleSelect).toHaveValue('Guest');
    expect(
      screen.getByText('Limited to Guest by their workspace role.'),
    ).toBeInTheDocument();
  });

  it('AC-19: shows Already selected for candidates chosen in another row', async () => {
    mockFetch({
      'GET /api/workspaces/ws-1/projects/P1/member-candidates': () =>
        jsonResponse(200, { candidates }),
    });

    const user = userEvent.setup();
    renderModal();

    // Row 1: Select Alice
    const input1 = screen.getByRole('textbox', { name: 'Email' });
    await user.type(input1, 'ali');
    await waitFor(() => {
      expect(screen.getByText('alice@openplany.dev')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('option', { name: /alice@openplany\.dev/i }));

    // Add Row 2
    await user.click(screen.getByRole('button', { name: '+ Add more' }));

    // Row 2: Search Alice again
    const input2 = screen.getByRole('textbox', { name: 'Email' });
    await user.type(input2, 'ali');

    await waitFor(() => {
      expect(screen.getByText('Already selected')).toBeInTheDocument();
    });
    const optionAlice = screen.getByRole('option', { name: /alice@openplany\.dev/i });
    expect(optionAlice).toHaveAttribute('data-combobox-disabled', 'true');
  });

  it('AC-21: hides + Add more when row count reaches 20', async () => {
    const user = userEvent.setup();
    renderModal();

    const addMoreBtn = screen.getByRole('button', { name: '+ Add more' });

    // Add 19 more rows (total 20 rows)
    for (let i = 1; i < 20; i++) {
      await user.click(addMoreBtn);
    }

    // At 20 rows, "+ Add more" button is hidden
    expect(screen.queryByRole('button', { name: '+ Add more' })).not.toBeInTheDocument();
  });

  it('AC-24: displays notice when Project Admin role is selected', async () => {
    const user = userEvent.setup();
    renderModal();

    const roleSelect = screen.getByRole('combobox', { name: 'Role' });
    await user.click(roleSelect);
    await user.click(await screen.findByRole('option', { name: 'Project Admin' }));

    expect(
      screen.getByText('Project Admins can manage everyone in this project, including you.'),
    ).toBeInTheDocument();
  });

  it('AC-25: confirms discard changes when dirty, closes directly when clean', async () => {
    mockFetch({
      'GET /api/workspaces/ws-1/projects/P1/member-candidates': () =>
        jsonResponse(200, { candidates }),
    });

    const user = userEvent.setup();
    const onClose = vi.fn();
    const { unmount } = renderModal({ onClose });

    // Clean modal: clicking Cancel button closes directly
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    // Dirty modal with selected candidate
    const onCloseDirty = vi.fn();
    renderModal({ onClose: onCloseDirty });

    const input = screen.getByRole('textbox', { name: 'Email' });
    await user.type(input, 'ali');
    await waitFor(() => {
      expect(screen.getByText('alice@openplany.dev')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('option', { name: /alice@openplany\.dev/i }));

    // Clicking Cancel opens discard confirmation
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Discard changes?')).toBeInTheDocument();
    expect(onCloseDirty).not.toHaveBeenCalled();

    // Click Discard confirms
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onCloseDirty).toHaveBeenCalledTimes(1);
  });

  it('AC-42: in exact mode, typing admin@localhost qualifies as a full email', async () => {
    mockFetch({
      'GET /api/workspaces/ws-1/projects/P1/member-candidates': () =>
        jsonResponse(200, { candidates }),
    });

    const user = userEvent.setup();
    renderModal({ canSeeEmail: false });

    const input = screen.getByRole('textbox', { name: 'Email' });
    await user.type(input, 'admin@localhost');

    await waitFor(() => {
      expect(screen.getByText('admin@localhost')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('option', { name: /admin@localhost/i }));
    expect(screen.getByText('Admin Local')).toBeInTheDocument();
  });

  it('shows 429 rate limit error when candidate search exceeds limit', async () => {
    mockFetch({
      'GET /api/workspaces/ws-1/projects/P1/member-candidates': () =>
        apiError(429, 'RATE_LIMITED', 'Too many searches', {
          retryAfterSeconds: 45,
        }),
    });

    const user = userEvent.setup();
    renderModal();

    const input = screen.getByRole('textbox', { name: 'Email' });
    await user.type(input, 'test');

    await waitFor(() => {
      expect(
        screen.getByText('Too many searches. Try again in 45 seconds.'),
      ).toBeInTheDocument();
    });
  });
});
