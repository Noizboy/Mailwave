import Image from "next/image";
import logo from "@/public/logo.png";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center justify-center">
            <Image src={logo} alt="MailWave" className="h-14 w-auto" />
          </div>
          <p className="text-sm text-muted-foreground">
            AI-powered personalized email campaigns
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
