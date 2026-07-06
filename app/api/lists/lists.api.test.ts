// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth");
vi.mock("@/lib/prisma");

import { prisma } from "@/lib/prisma";
import { mockSession, jsonRequest, routeParams } from "@/test/api-helpers";
import { GET as getLists, POST as createList } from "./route";
import { GET as getList, PATCH as renameList, DELETE as deleteList } from "./[id]/route";
import { POST as addMembers, DELETE as removeMembers } from "./[id]/members/route";

const mocked = vi.mocked;

describe("api/lists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession("user-1");
  });

  describe("GET /api/lists", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession(null);
      const res = await getLists();
      expect(res.status).toBe(401);
    });

    it("computes health stats per list", async () => {
      mocked(prisma.list.findMany).mockResolvedValue([
        {
          id: "l1",
          name: "Leads",
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { members: 3 },
          members: [
            { contact: { status: "subscribed" } },
            { contact: { status: "subscribed" } },
            { contact: { status: "invalid" } },
          ],
        },
      ] as never);

      const res = await getLists();
      const body = await res.json();

      expect(body[0]).toMatchObject({ totalContacts: 3, subscribedContacts: 2, issueCount: 1 });
      expect(prisma.list.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user-1" } })
      );
    });
  });

  describe("POST /api/lists", () => {
    it("returns 400 for a blank name", async () => {
      const res = await createList(
        jsonRequest("/api/lists", { method: "POST", body: { name: "   " } })
      );
      expect(res.status).toBe(400);
    });

    it("creates the list with a trimmed name", async () => {
      mocked(prisma.list.create).mockResolvedValue({ id: "l1", name: "Leads" } as never);
      const res = await createList(
        jsonRequest("/api/lists", { method: "POST", body: { name: "  Leads  " } })
      );
      expect(res.status).toBe(201);
      expect(prisma.list.create).toHaveBeenCalledWith({
        data: { userId: "user-1", name: "Leads" },
      });
    });
  });

  describe("GET /api/lists/[id]", () => {
    it("returns 404 for another user's list", async () => {
      mocked(prisma.list.findFirst).mockResolvedValue(null as never);
      const res = await getList(jsonRequest("/api/lists/x"), routeParams({ id: "x" }));
      expect(res.status).toBe(404);
    });

    it("returns member stats broken down by contact status", async () => {
      mocked(prisma.list.findFirst).mockResolvedValue({
        id: "l1",
        name: "Leads",
        members: [
          { contact: { status: "subscribed" } },
          { contact: { status: "suppressed" } },
          { contact: { status: "unsubscribed" } },
          { contact: { status: "invalid" } },
        ],
      } as never);

      const res = await getList(jsonRequest("/api/lists/l1"), routeParams({ id: "l1" }));
      const body = await res.json();

      expect(body.stats).toEqual({
        total: 4,
        subscribed: 1,
        unsubscribed: 1,
        suppressed: 1,
        invalid: 1,
      });
    });
  });

  describe("PATCH /api/lists/[id]", () => {
    it("returns 404 when nothing was updated (not owned)", async () => {
      mocked(prisma.list.updateMany).mockResolvedValue({ count: 0 } as never);
      const res = await renameList(
        jsonRequest("/api/lists/x", { method: "PATCH", body: { name: "New" } }),
        routeParams({ id: "x" })
      );
      expect(res.status).toBe(404);
    });

    it("renames scoped to the session user", async () => {
      mocked(prisma.list.updateMany).mockResolvedValue({ count: 1 } as never);
      const res = await renameList(
        jsonRequest("/api/lists/l1", { method: "PATCH", body: { name: " Renamed " } }),
        routeParams({ id: "l1" })
      );
      expect(res.status).toBe(200);
      expect(prisma.list.updateMany).toHaveBeenCalledWith({
        where: { id: "l1", userId: "user-1" },
        data: { name: "Renamed" },
      });
    });
  });

  describe("DELETE /api/lists/[id]", () => {
    it("deletes scoped to the session user", async () => {
      mocked(prisma.list.deleteMany).mockResolvedValue({ count: 1 } as never);
      await deleteList(jsonRequest("/api/lists/l1", { method: "DELETE" }), routeParams({ id: "l1" }));
      expect(prisma.list.deleteMany).toHaveBeenCalledWith({
        where: { id: "l1", userId: "user-1" },
      });
    });
  });

  describe("POST /api/lists/[id]/members", () => {
    it("returns 404 when the list is not owned", async () => {
      mocked(prisma.list.findFirst).mockResolvedValue(null as never);
      const res = await addMembers(
        jsonRequest("/api/lists/x/members", { method: "POST", body: { contactIds: ["c1"] } }),
        routeParams({ id: "x" })
      );
      expect(res.status).toBe(404);
    });

    it("returns 400 for an empty contactIds array", async () => {
      mocked(prisma.list.findFirst).mockResolvedValue({ id: "l1" } as never);
      const res = await addMembers(
        jsonRequest("/api/lists/l1/members", { method: "POST", body: { contactIds: [] } }),
        routeParams({ id: "l1" })
      );
      expect(res.status).toBe(400);
    });

    it("adds members skipping duplicates", async () => {
      mocked(prisma.list.findFirst).mockResolvedValue({ id: "l1" } as never);
      mocked(prisma.contact.findMany).mockResolvedValue([{ id: "c1" }, { id: "c2" }] as never);
      mocked(prisma.listMember.createMany).mockResolvedValue({ count: 2 } as never);

      const res = await addMembers(
        jsonRequest("/api/lists/l1/members", { method: "POST", body: { contactIds: ["c1", "c2"] } }),
        routeParams({ id: "l1" })
      );

      expect((await res.json()).added).toBe(2);
      expect(prisma.listMember.createMany).toHaveBeenCalledWith({
        data: [
          { listId: "l1", contactId: "c1" },
          { listId: "l1", contactId: "c2" },
        ],
        skipDuplicates: true,
      });
    });
  });

  describe("DELETE /api/lists/[id]/members", () => {
    it("removes only the given contacts from the list", async () => {
      mocked(prisma.list.findFirst).mockResolvedValue({ id: "l1" } as never);
      mocked(prisma.listMember.deleteMany).mockResolvedValue({ count: 1 } as never);

      await removeMembers(
        jsonRequest("/api/lists/l1/members", { method: "DELETE", body: { contactIds: ["c1"] } }),
        routeParams({ id: "l1" })
      );

      expect(prisma.listMember.deleteMany).toHaveBeenCalledWith({
        where: { listId: "l1", contactId: { in: ["c1"] } },
      });
    });
  });
});
