import type { User } from '../../src/auth/entities/user.entity.js';
import {
  EmailAlreadyExistsError,
  type LockedUserWrites,
  type UserChanges,
} from '../../src/auth/repositories/lockedUsers.js';
import {
  AdminUsersRepository,
  type CreatedUserRow,
  type LockedActorAndTarget,
  type NewUser,
} from '../../src/admin/repositories/adminUsersRepository.js';

/**
 * In-memory AdminUsersRepository: `withLockedActorAndTarget` hands `work` the
 * rows from `users` (the same object when actor = target) and records writes.
 */
export class FakeAdminUsersRepository extends AdminUsersRepository {
  readonly users: User[] = [];
  readonly updates: { userId: string; changes: UserChanges }[] = [];
  /** Live sessions per user id; revokeAllSessions empties them. */
  readonly liveSessions = new Map<string, number>();
  /** Simulates two transactions passing the email check at once. */
  failNextUpdateWithUniqueEmail = false;
  locks = 0;

  createUser(user: NewUser): Promise<CreatedUserRow> {
    return Promise.resolve({
      id: `created-${user.username}`,
      createdAt: user.at,
    });
  }

  list(): Promise<{ items: User[]; total: number }> {
    return Promise.resolve({ items: this.users, total: this.users.length });
  }

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.users.find((user) => user.id === id) ?? null);
  }

  withLockedActorAndTarget<T>(
    actorId: string,
    targetId: string,
    work: (locked: LockedActorAndTarget) => Promise<T>,
  ): Promise<T> {
    this.locks += 1;
    const find = (id: string): User | null =>
      this.users.find((user) => user.id === id) ?? null;
    const writes: LockedUserWrites = {
      emailTakenByOther: (email, userId) =>
        Promise.resolve(
          this.users.some(
            (user) =>
              user.id !== userId &&
              user.email?.toLowerCase() === email.toLowerCase(),
          ),
        ),
      updateUser: (userId, changes) => {
        if (this.failNextUpdateWithUniqueEmail) {
          this.failNextUpdateWithUniqueEmail = false;
          return Promise.reject(new EmailAlreadyExistsError());
        }
        this.updates.push({ userId, changes });
        const row = find(userId);
        if (row !== null) Object.assign(row, changes);
        return Promise.resolve();
      },
      revokeAllSessions: (userId) => {
        const count = this.liveSessions.get(userId) ?? 0;
        this.liveSessions.set(userId, 0);
        return Promise.resolve(count);
      },
      findLiveSession: (_userId, _tokenHash) => Promise.resolve(null),
      insertSession: (_session) => Promise.resolve(),
    };
    return work({ actor: find(actorId), target: find(targetId), writes });
  }
}
