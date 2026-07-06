// @vitest-environment node
// jsdom's File breaks undici's multipart parsing (file.text() returns "undefined"),
// so API tests that touch FormData must run in the node environment.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth");
vi.mock("@/lib/prisma");

import { prisma } from "@/lib/prisma";
import { mockSession, jsonRequest, routeParams } from "@/test/api-helpers";
import { POST as uploadCsv } from "./route";
import { POST as saveImport } from "./[id]/save/route";
import { POST as cancelImport } from "./[id]/cancel/route";

const mocked = vi.mocked;

function csvUploadRequest(content: string, filename = "contacts.csv", type = "text/csv") {
  const formData = new FormData();
  formData.append("file", new File([content], filename, { type }));
  return new NextRequest("http://localhost:3000/api/import", {
    method: "POST",
    body: formData,
  });
}

describe("api/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession("user-1");
  });

  describe("POST /api/import (upload)", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession(null);
      const res = await uploadCsv(csvUploadRequest("email\na@b.com"));
      expect(res.status).toBe(401);
    });

    it("returns 400 when no file is provided", async () => {
      const formData = new FormData();
      const res = await uploadCsv(
        new NextRequest("http://localhost:3000/api/import", { method: "POST", body: formData })
      );
      expect(res.status).toBe(400);
    });

    it("rejects non-CSV files", async () => {
      const res = await uploadCsv(csvUploadRequest("hello", "notes.txt", "text/plain"));
      expect(res.status).toBe(400);
    });

    it("returns 422 when the CSV has no email column", async () => {
      const res = await uploadCsv(csvUploadRequest("name,company\nAlice,Acme"));
      expect(res.status).toBe(422);
    });

    it("classifies rows as valid, invalid, duplicate, and missing_data", async () => {
      // dup@x.com already exists as a contact for this user
      mocked(prisma.contact.findMany).mockResolvedValue([{ email: "dup@x.com" }] as never);
      mocked(prisma.import.create).mockResolvedValue({ id: "imp-1" } as never);
      mocked(prisma.importRow.createMany).mockResolvedValue({ count: 5 } as never);
      mocked(prisma.import.update).mockResolvedValue({} as never);

      const csv = [
        "email,name",
        "good@x.com,Good",        // valid
        "bad-email,Bad",          // invalid
        "dup@x.com,Dup",          // duplicate (existing contact)
        ",NoEmail",               // missing_data
        "good@x.com,InFileDup",   // duplicate (repeated within file)
      ].join("\n");

      const res = await uploadCsv(csvUploadRequest(csv));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toMatchObject({
        importId: "imp-1",
        rowCount: 5,
        validCount: 1,
        invalidCount: 2, // invalid format + missing email
        duplicateCount: 2, // existing contact + in-file repeat
      });
      expect(prisma.importRow.createMany).toHaveBeenCalledOnce();
      const rows = mocked(prisma.importRow.createMany).mock.calls[0][0]?.data as Array<{
        status: string;
      }>;
      expect(rows.map((r) => r.status)).toEqual([
        "valid",
        "invalid",
        "duplicate",
        "missing_data",
        "duplicate",
      ]);
    });
  });

  describe("POST /api/import/[id]/save", () => {
    const importRecord = {
      id: "imp-1",
      userId: "user-1",
      status: "review",
      columnMapping: { email: "email", name: "firstName", color: "color" },
      rows: [
        {
          rowIndex: 0,
          status: "valid",
          rowData: { email: "Good@X.com", name: "Good", color: "blue" },
        },
        { rowIndex: 1, status: "invalid", rowData: { email: "bad", name: "Bad" } },
        { rowIndex: 2, status: "duplicate", rowData: { email: "dup@x.com", name: "Dup" } },
      ],
    };

    it("returns 404 for another user's import", async () => {
      mocked(prisma.import.findFirst).mockResolvedValue(null as never);
      const res = await saveImport(
        jsonRequest("/api/import/imp-1/save", { method: "POST", body: {} }),
        routeParams({ id: "imp-1" })
      );
      expect(res.status).toBe(404);
    });

    it("returns 409 when already saved", async () => {
      mocked(prisma.import.findFirst).mockResolvedValue({
        ...importRecord,
        status: "saved",
      } as never);
      const res = await saveImport(
        jsonRequest("/api/import/imp-1/save", { method: "POST", body: {} }),
        routeParams({ id: "imp-1" })
      );
      expect(res.status).toBe(409);
    });

    it("saves only valid rows, maps custom fields, and marks the import saved", async () => {
      mocked(prisma.import.findFirst).mockResolvedValue(importRecord as never);
      mocked(prisma.contact.upsert).mockResolvedValue({ id: "c-1" } as never);
      mocked(prisma.import.update).mockResolvedValue({} as never);

      const res = await saveImport(
        jsonRequest("/api/import/imp-1/save", { method: "POST", body: {} }),
        routeParams({ id: "imp-1" })
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toMatchObject({ savedCount: 1, skippedCount: 2 });
      expect(prisma.contact.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.contact.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            email: "good@x.com",
            firstName: "Good",
            customFields: { color: "blue" },
            status: "subscribed",
            importId: "imp-1",
          }),
        })
      );
      expect(prisma.import.update).toHaveBeenCalledWith({
        where: { id: "imp-1" },
        data: { status: "saved" },
      });
    });

    it("creates a new list and attaches saved contacts when createListName is given", async () => {
      mocked(prisma.import.findFirst).mockResolvedValue(importRecord as never);
      mocked(prisma.list.create).mockResolvedValue({ id: "list-9" } as never);
      mocked(prisma.contact.upsert).mockResolvedValue({ id: "c-1" } as never);
      mocked(prisma.listMember.upsert).mockResolvedValue({} as never);
      mocked(prisma.import.update).mockResolvedValue({} as never);

      const res = await saveImport(
        jsonRequest("/api/import/imp-1/save", {
          method: "POST",
          body: { createListName: "Imported July" },
        }),
        routeParams({ id: "imp-1" })
      );
      const body = await res.json();

      expect(body.listId).toBe("list-9");
      expect(prisma.list.create).toHaveBeenCalledWith({
        data: { userId: "user-1", name: "Imported July" },
      });
      expect(prisma.listMember.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { listId: "list-9", contactId: "c-1" },
        })
      );
    });
  });

  describe("POST /api/import/[id]/cancel", () => {
    it("cancels scoped to the session user and deletes rows", async () => {
      mocked(prisma.import.updateMany).mockResolvedValue({ count: 1 } as never);
      mocked(prisma.importRow.deleteMany).mockResolvedValue({ count: 3 } as never);

      const res = await cancelImport(
        jsonRequest("/api/import/imp-1/cancel", { method: "POST" }),
        routeParams({ id: "imp-1" })
      );

      expect(res.status).toBe(200);
      expect(prisma.import.updateMany).toHaveBeenCalledWith({
        where: { id: "imp-1", userId: "user-1" },
        data: { status: "cancelled" },
      });
      expect(prisma.importRow.deleteMany).toHaveBeenCalledWith({ where: { importId: "imp-1" } });
    });
  });
});
