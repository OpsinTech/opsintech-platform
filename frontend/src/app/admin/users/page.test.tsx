import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/core/i18n/context";

import AdminUsersPage from "./page";

const mocks = vi.hoisted(() => ({
  fetchAuthApi: vi.fn(),
  savedLocale: null as string | null,
}));

vi.mock("@/core/api/auth-client", () => ({
  fetchAuthApi: mocks.fetchAuthApi,
}));

vi.mock("@/core/i18n/cookies", () => ({
  getLocaleFromCookie: () => mocks.savedLocale,
  setLocaleInCookie: vi.fn(),
}));

vi.mock("./create-user-dialog", () => ({ CreateUserDialog: () => null }));
vi.mock("./delete-user-dialog", () => ({ DeleteUserDialog: () => null }));
vi.mock("./edit-user-dialog", () => ({ EditUserDialog: () => null }));
vi.mock("./reset-user-password-dialog", () => ({ ResetUserPasswordDialog: () => null }));

const CREATED_AT = "2026-03-05T14:30:00Z";

function mockUsers(users: Array<Record<string, unknown>>) {
  mocks.fetchAuthApi.mockResolvedValue({
    ok: true,
    json: async () => ({ users }),
  });
}

function renderPage() {
  return render(
    <I18nProvider initialLocale="en-US">
      <AdminUsersPage />
    </I18nProvider>,
  );
}

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name).closest("tr");
  if (!row) throw new Error(`Row for ${name} not found`);
  return row as HTMLElement;
}

async function waitForUserRow(name: string) {
  await waitFor(() => {
    expect(screen.getByText(name)).toBeInTheDocument();
  }, { timeout: 2000 });
  return rowOf(name);
}

describe("AdminUsersPage createdAt column", () => {
  beforeEach(() => {
    mocks.fetchAuthApi.mockReset();
    mocks.savedLocale = null;
  });

  it.each([
    [
      "en-US",
      ["User ID / Name", "Email", "Role", "Status", "Created At", "Actions"],
      "Created At",
    ],
    [
      "zh-CN",
      ["用户ID / 名称", "邮箱", "角色", "状态", "创建时间", "操作"],
      "创建时间",
    ],
    [
      "ja",
      ["ユーザーID / 名前", "メールアドレス", "ロール", "ステータス", "作成日時", "アクション"],
      "作成日時",
    ],
    [
      "ko",
      ["사용자 ID / 이름", "이메일", "역할", "상태", "생성 일시", "작업"],
      "생성 일시",
    ],
  ])("renders the localized column header between status and actions in %s", async (locale, expectedHeaders, expectedHeader) => {
    mocks.savedLocale = locale;
    mockUsers([{ id: "u-1", email: "a@example.com", name: "Alice", role: "admin", status: "active", createdAt: CREATED_AT }]);

    renderPage();

    await waitForUserRow("Alice");
    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: expectedHeader })).toBeInTheDocument();
    });

    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(expectedHeaders);
  });

  it("renders each user's createdAt as a local date-time in the new column", async () => {
    mockUsers([{ id: "u-2", email: "b@example.com", name: "Bob", role: "user", status: "active", createdAt: CREATED_AT }]);

    renderPage();

    const row = await waitForUserRow("Bob");
    expect(within(row).getAllByRole("cell")).toHaveLength(6);
    expect(within(row).getAllByRole("cell")[4]).toHaveTextContent(new Date(CREATED_AT).toLocaleString());
    expect(within(row).getAllByRole("cell")[4]).not.toHaveTextContent("Invalid Date");
  });

  it("falls back to a placeholder for null, empty and invalid createdAt values", async () => {
    mockUsers([
      { id: "u-3", email: null, name: "Null Date", role: "user", status: "active", createdAt: null },
      { id: "u-4", email: null, name: "Empty Date", role: "user", status: "active", createdAt: "" },
      { id: "u-5", email: null, name: "Bad Date", role: "user", status: "active", createdAt: "not-a-date" },
    ]);

    renderPage();

    const row = await waitForUserRow("Bad Date");
    expect(within(row).getAllByRole("cell")[4]).toHaveTextContent(/^-$/);
    for (const name of ["Null Date", "Empty Date"]) {
      expect(within(rowOf(name)).getAllByRole("cell")[4]).toHaveTextContent(/^-$/);
    }
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });
});
