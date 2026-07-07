import { ContactsClient } from "@/components/contacts/contacts-client";
import { TopBar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Upload } from "lucide-react";
import { AddContactButton } from "@/components/contacts/add-contact-button";

export default function ContactsPage() {
  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Contacts"
        hideTitleOnMobile
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild className="hidden md:inline-flex">
              <Link href="/upload">
                <Upload className="h-4 w-4" />
                Import CSV
              </Link>
            </Button>
            <AddContactButton />
          </div>
        }
      />
      <main className="flex-1 overflow-y-auto">
        <ContactsClient />
      </main>
    </div>
  );
}
