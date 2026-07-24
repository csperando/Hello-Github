import path from "path";

// api project root - this file lives at <root>/test/setup.mock.repo.ts
const API_ROOT = path.join(__dirname, "..");

/**
 * Creates a jest.fn() for every method accessed on the returned proxy,
 * so new repo methods are automatically mocked without touching this file.
 */
export function createMockRepoProxy<T extends object>(): jest.Mocked<T> & { __reset: () => void } {
    const fns: Record<string, jest.Mock> = {};

    const proxy = new Proxy({} as Record<string, unknown>, {
        get(_target, prop: string) {
            if (prop === "__reset") {
                return () => Object.values(fns).forEach((fn) => fn.mockReset());
            }
            if (!fns[prop]) {
                fns[prop] = jest.fn();
            }
            return fns[prop];
        },
    });

    return proxy as unknown as jest.Mocked<T> & { __reset: () => void };
}

/**
 * `repoPath` is resolved relative to the api project root (e.g. "repository/orgs.repo"),
 * not relative to the calling test file - jest.mock() resolves relative paths against
 * whichever file it's textually called from, which is this file, not the test file.
 */
export function mockRepo<T extends object>(repoPath: string, proxy: jest.Mocked<T> & { __reset: () => void }) {
    jest.mock(path.join(API_ROOT, repoPath), () => ({
        __esModule: true,
        default: {
            repo: () => proxy,
        },
    }));
}
