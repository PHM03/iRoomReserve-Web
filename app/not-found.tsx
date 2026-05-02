import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="glass-card w-full max-w-lg border border-[#a12124]/12 p-8 text-center sm:p-10">
        <span className="inline-flex rounded-full border border-[#a12124]/15 bg-[#a12124]/10 px-3 py-1 text-sm font-bold text-[#a12124]">
          404 Error
        </span>

        <h1 className="mt-5 text-3xl font-bold text-black sm:text-4xl">
          Page Not Found
        </h1>

        <p className="mt-3 text-sm leading-6 text-black/70 sm:text-base">
          The page you are trying to visit does not exist or may have been moved.
        </p>

        <Link
          href="/"
          className="btn-primary mt-8 inline-flex items-center justify-center px-6 py-3"
        >
          Back to Home
        </Link>
      </div>
    </main>
  );
}
