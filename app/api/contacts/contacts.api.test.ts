// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth");
vi.mock("@/lib/prisma");

import { prisma } from "@/lib/prisma";
import { mockSession, jsonRequest, routeParams } from "@/test/api-helpers";
import { GET as listContacts, POST as createContact } from "./route";
import {
  GET as getContact,
  PATCH as updateContact,
  DELETE as deleteContact,
} from "./[id]/route";

const mocked = vi.mocked;

const contact = {
  id: "contact-1",
  userId: "user-1",
  email: "a@b.com",
  status: "subscribed",
};

describe("api/contacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession("user-1");
  });

  describe("GET /api/contacts", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession(null);
      const res = await listContacts(jsonRequest("/api/contacts"));
      expect(res.status).toBe(401);
    });

    it("scopes the query to the session user", async () => {
      mocked(prisma.contact.findMany).mockResolvedValue([contact] as never);
      mocked(prisma.contact.count).mockResolvedValue(1 as never);

      const res = await listContacts(jsonRequest("/api/contacts"));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.total).toBe(1);
      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: "user-1" }) })
      );
    });

    it("applies search, status filter, and clamps limit to 100", async () => {
      mocked(prisma.contact.findMany).mockResolvedValue([] as never);
      mocked(prisma.contact.count).mockResolvedValue(0 as never);

      await listContacts(
        jsonRequest("/api/contacts", {
          searchParams: { search: "acme", status: "subscribed", limit: "500", page: "2" },
        })
      );

      const args = mocked(prisma.contact.findMany).mock.calls[0][0];
      expect(args?.where).toMatchObject({ userId: "user-1", status: "subscribed" });
      expect(args?.where?.OR).toBeDefined();
      expect(args?.take).toBe(100);
      expect(args?.skip).toBe(100); // page 2 with clamped limit 100
    });
  });

  describe("POST /api/contacts", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession(null);
      const res = await createContact(
        jsonRequest("/api/contacts", { method: "POST", body: { email: "a@b.com" } })
      );
      expect(res.status).toBe(401);
    });

    it("returns 400 on invalid email", async () => {
      const res = await createContact(
        jsonRequest("/api/contacts", { method: "POST", body: { email: "not-an-email" } })
      );
      expect(res.status).toBe(400);
      expect(prisma.contact.create).not.toHaveBeenCalled();
    });

    it("returns 409 when the email already exists for this user", async () => {
      mocked(prisma.contact.findFirst).mockResolvedValue(contact as never);
      const res = await createContact(
        jsonRequest("/api/contacts", { method: "POST", body: { email: "A@B.com" } })
      );
      expect(res.status).toBe(409);
    });

    it("creates the contact with lowercased email and adds it to a list", async () => {
      mocked(prisma.contact.findFirst).mockResolvedValue(null as never);
      // Ownership check for the supplied listId must find a list owned by the user.
      mocked(prisma.list.findFirst).mockResolvedValue({ id: "list-1" } as never);
      mocked(prisma.contact.create).mockResolvedValue({ ...contact, id: "new-1" } as never);
      mocked(prisma.listMember.create).mockResolvedValue({} as never);

      const res = await createContact(
        jsonRequest("/api/contacts", {
          method: "POST",
          body: { email: "New@Example.COM", firstName: "New", listId: "list-1" },
        })
      );

      expect(res.status).toBe(201);
      expect(prisma.contact.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "new@example.com",
            userId: "user-1",
            status: "subscribed",
          }),
        })
      );
      expect(prisma.listMember.create).toHaveBeenCalledWith({
        data: { listId: "list-1", contactId: "new-1" },
      });
    });

    it("returns 404 and does not add a membership when the listId is not owned by the user", async () => {
      mocked(prisma.contact.findFirst).mockResolvedValue(null as never);
      // list.findFirst scoped by userId finds nothing → not the caller's list.
      mocked(prisma.list.findFirst).mockResolvedValue(null as never);

      const res = await createContact(
        jsonRequest("/api/contacts", {
          method: "POST",
          body: { email: "victim-list@example.com", listId: "someone-elses-list" },
        })
      );

      expect(res.status).toBe(404);
      expect(prisma.contact.create).not.toHaveBeenCalled();
      expect(prisma.listMember.create).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/contacts/[id]", () => {
    it("returns 404 for another user's contact", async () => {
      mocked(prisma.contact.findFirst).mockResolvedValue(null as never);
      const res = await getContact(
        jsonRequest("/api/contacts/other"),
        routeParams({ id: "other" })
      );
      expect(res.status).toBe(404);
      expect(prisma.contact.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "other", userId: "user-1" }),
        })
      );
    });

    it("returns the contact when owned", async () => {
      mocked(prisma.contact.findFirst).mockResolvedValue(contact as never);
      const res = await getContact(
        jsonRequest("/api/contacts/contact-1"),
        routeParams({ id: "contact-1" })
      );
      expect(res.status).toBe(200);
      expect((await res.json()).id).toBe("contact-1");
    });
  });

  describe("PATCH /api/contacts/[id]", () => {
    it("returns 409 for unsubscribed contacts", async () => {
      mocked(prisma.contact.findFirst).mockResolvedValue({
        ...contact,
        status: "unsubscribed",
      } as never);
      const res = await updateContact(
        jsonRequest("/api/contacts/contact-1", { method: "PATCH", body: { firstName: "X" } }),
        routeParams({ id: "contact-1" })
      );
      expect(res.status).toBe(409);
      expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it("returns 400 on invalid status value", async () => {
      mocked(prisma.contact.findFirst).mockResolvedValue(contact as never);
      const res = await updateContact(
        jsonRequest("/api/contacts/contact-1", { method: "PATCH", body: { status: "bogus" } }),
        routeParams({ id: "contact-1" })
      );
      expect(res.status).toBe(400);
    });

    it("updates an owned contact", async () => {
      mocked(prisma.contact.findFirst).mockResolvedValue(contact as never);
      mocked(prisma.contact.update).mockResolvedValue({ ...contact, firstName: "Ann" } as never);
      const res = await updateContact(
        jsonRequest("/api/contacts/contact-1", { method: "PATCH", body: { firstName: "Ann" } }),
        routeParams({ id: "contact-1" })
      );
      expect(res.status).toBe(200);
      expect((await res.json()).firstName).toBe("Ann");
    });
  });

  describe("DELETE /api/contacts/[id]", () => {
    it("deletes scoped to the session user", async () => {
      mocked(prisma.contact.deleteMany).mockResolvedValue({ count: 1 } as never);
      const res = await deleteContact(
        jsonRequest("/api/contacts/contact-1", { method: "DELETE" }),
        routeParams({ id: "contact-1" })
      );
      expect(res.status).toBe(200);
      expect(prisma.contact.deleteMany).toHaveBeenCalledWith({
        where: { id: "contact-1", userId: "user-1" },
      });
    });
  });
});
